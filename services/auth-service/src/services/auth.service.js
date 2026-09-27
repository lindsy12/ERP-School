// The rules of logging in, independent of HTTP.
const crypto = require('crypto');
const userModel = require('../models/user.model');
const refreshTokenModel = require('../models/refreshToken.model');
const tokenService = require('./token.service');
const { hashPassword, verifyPassword } = require('../utils/password');
const HttpError = require('../utils/httpError');
const securityLog = require('../utils/securityLog');
const { security } = require('../config/env');

const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const accountLocked = () => new HttpError(423, 'ACCOUNT_LOCKED', 'Account temporarily locked');

// One error for every refresh failure (unknown, expired, revoked, reused), so a caller learns
// nothing except "log in again".
const invalidRefreshToken = () =>
  new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');

// When the email doesn't exist we still run bcrypt against this throwaway hash, so a missing
// user takes as long to reject as a wrong password. Otherwise response time would reveal
// which emails are registered.
let dummyHash;
function getDummyHash() {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

const isLocked = (user, now) => Boolean(user.locked_until) && user.locked_until > now;

// The counter after one more wrong password. Once a lock has run out, counting starts again,
// so the user gets a full set of attempts instead of being locked again by the first mistake.
function nextFailureState(current, now) {
  const lockExpired = Boolean(current.locked_until) && current.locked_until <= now;
  const failedAttempts = (lockExpired ? 0 : current.failed_login_attempts) + 1;
  const lockedUntil =
    failedAttempts >= security.maxFailedAttempts
      ? new Date(now.getTime() + security.lockoutMinutes * 60 * 1000)
      : null;
  return { failedAttempts, lockedUntil };
}

// Counts a wrong password against a real account; returns true if this attempt locked it.
async function registerFailedLogin(user, now) {
  const next = await userModel.recordFailedLogin(user.id, (current) => nextFailureState(current, now));
  // "=== max", not ">= max": attempts that raced past the limit don't log the same lockout again.
  if (next.failedAttempts !== security.maxFailedAttempts) return false;

  securityLog('warn', 'auth.account.locked', {
    message: `Account locked after ${next.failedAttempts} failed logins`,
    userId: user.id,
    tenantId: user.tenant_id,
    failedAttempts: next.failedAttempts,
    lockedUntil: next.lockedUntil.toISOString(),
  });
  return true;
}

async function login({ tenantId, email, password }) {
  const now = new Date();
  const user = await userModel.findByTenantAndEmail(tenantId, email);

  // Checked before the password, so a locked account gives no feedback on password guesses.
  if (user && isLocked(user, now)) throw accountLocked();

  const passwordMatches = await verifyPassword(password, user ? user.password_hash : await getDummyHash());

  if (user && !passwordMatches && (await registerFailedLogin(user, now))) {
    throw accountLocked(); // tell the user now, rather than on their next try
  }

  // Same error for every failure reason, so attackers can't tell which one it was.
  if (!user || !passwordMatches || !user.is_active) {
    throw invalidCredentials();
  }

  if (user.failed_login_attempts > 0 || user.locked_until) {
    await userModel.resetFailedLogins(user.id);
  }

  const refresh = tokenService.generateRefreshToken();
  await refreshTokenModel.startFamily({
    familyId: crypto.randomUUID(), // a new login starts a new token family
    userId: user.id,
    tokenId: crypto.randomUUID(),
    tokenHash: refresh.tokenHash, // only the hash is stored; the raw token goes to the client once
    expiresAt: refresh.expiresAt,
  });

  return tokenResponse(user, refresh.token);
}

function tokenResponse(user, refreshToken) {
  return {
    access_token: tokenService.signAccessToken(user),
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: tokenService.accessTokenTtlSeconds,
  };
}

// Rotation: every refresh token works once. Using it revokes it and issues a new one in the same
// family (the same login session). If a token that was already rotated comes back, two parties
// hold copies of it and we can't tell which one is the real user, so the whole family is revoked
// and both must log in again.
async function refresh(refreshToken) {
  const outcome = await refreshTokenModel.withTransaction(async (tx) => {
    const now = new Date();
    const current = await tx.findByHashForUpdate(tokenService.hashRefreshToken(refreshToken));

    if (!current || current.expires_at <= now || current.family_revoked_at) {
      return { ok: false }; // unknown, expired, or the session was ended (logout / earlier reuse)
    }

    if (current.revoked_at) {
      await tx.revokeFamily(current.family_id, now);
      return { ok: false, reuse: current }; // return, not throw: throwing would roll back the revocation
    }

    const user = await userModel.findById(current.user_id);
    if (!user || !user.is_active) return { ok: false };

    const next = tokenService.generateRefreshToken();
    await tx.rotate({
      oldTokenId: current.id,
      familyId: current.family_id,
      newTokenId: crypto.randomUUID(),
      newTokenHash: next.tokenHash,
      newExpiresAt: next.expiresAt,
      now,
    });
    return { ok: true, user, refreshToken: next.token };
  });

  if (outcome.reuse) {
    securityLog('warn', 'auth.refresh_token.reuse_detected', {
      message: 'A revoked refresh token was used again; its token family was revoked',
      userId: outcome.reuse.user_id,
      familyId: outcome.reuse.family_id,
      tokenId: outcome.reuse.id,
    });
  }
  if (!outcome.ok) throw invalidRefreshToken();

  return tokenResponse(outcome.user, outcome.refreshToken);
}

// Ends the session the refresh token belongs to. Only its owner can do this. Ending a session
// that is already ended succeeds, so a client can retry safely.
async function logout(userId, refreshToken) {
  const found = await refreshTokenModel.withTransaction(async (tx) => {
    const current = await tx.findByHashForUpdate(tokenService.hashRefreshToken(refreshToken));
    if (!current || current.user_id !== userId) return false;
    if (!current.family_revoked_at) await tx.revokeFamily(current.family_id);
    return true;
  });

  if (!found) throw invalidRefreshToken();
}

async function getMe(userId) {
  const user = await userModel.findById(userId);
  // The token may still be valid for a few minutes after an account is disabled or deleted.
  if (!user || !user.is_active) {
    throw new HttpError(401, 'UNAUTHORIZED', 'User no longer exists or is disabled');
  }
  return { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id };
}

// Admin action: clears a lockout early. Admins only reach users of their own school; any other id
// gets the same 404 as a missing one, so the response doesn't reveal that the account exists.
async function unlockUser(admin, userId) {
  const target = await userModel.findById(userId);
  if (!target || target.tenant_id !== admin.tenant_id) {
    throw new HttpError(404, 'NOT_FOUND', 'User not found');
  }

  await userModel.resetFailedLogins(userId);
  securityLog('info', 'auth.account.unlocked', {
    message: 'Account unlocked by an administrator',
    userId,
    tenantId: target.tenant_id,
    unlockedBy: admin.id,
  });
}

module.exports = { login, refresh, logout, unlockUser, getMe };
