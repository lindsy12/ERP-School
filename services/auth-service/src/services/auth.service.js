// The rules of logging in, independent of HTTP.
const crypto = require('crypto');
const userModel = require('../models/user.model');
const refreshTokenModel = require('../models/refreshToken.model');
const tokenService = require('./token.service');
const { hashPassword, verifyPassword } = require('../utils/password');
const HttpError = require('../utils/httpError');

const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

// When the email doesn't exist we still run bcrypt against this throwaway hash, so a missing
// user takes as long to reject as a wrong password. Otherwise response time would reveal
// which emails are registered.
let dummyHash;
function getDummyHash() {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

async function login({ tenantId, email, password }) {
  const user = await userModel.findByTenantAndEmail(tenantId, email);
  const passwordMatches = await verifyPassword(password, user ? user.password_hash : await getDummyHash());

  // Same error for every failure reason, so attackers can't tell which one it was.
  if (!user || !passwordMatches || !user.is_active) {
    throw invalidCredentials();
  }

  const refresh = tokenService.generateRefreshToken();
  await refreshTokenModel.startFamily({
    familyId: crypto.randomUUID(), // a new login starts a new token family
    userId: user.id,
    tokenId: crypto.randomUUID(),
    tokenHash: refresh.tokenHash, // only the hash is stored; the raw token goes to the client once
    expiresAt: refresh.expiresAt,
  });

  return {
    access_token: tokenService.signAccessToken(user),
    refresh_token: refresh.token,
    token_type: 'Bearer',
    expires_in: tokenService.accessTokenTtlSeconds,
  };
}

async function getMe(userId) {
  const user = await userModel.findById(userId);
  // The token may still be valid for a few minutes after an account is disabled or deleted.
  if (!user || !user.is_active) {
    throw new HttpError(401, 'UNAUTHORIZED', 'User no longer exists or is disabled');
  }
  return { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id };
}

module.exports = { login, getMe };
