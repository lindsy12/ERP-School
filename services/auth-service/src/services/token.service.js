// Everything about creating and checking tokens lives here.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');
const HttpError = require('../utils/httpError');

const ALGORITHM = 'HS256';
const accessTokenTtlSeconds = jwtConfig.accessTokenMinutes * 60;

// Claims: sub (user id), role, tenant_id, iat (added by the library), exp, jti (unique token id).
function signAccessToken(user) {
  return jwt.sign({ role: user.role, tenant_id: user.tenant_id }, jwtConfig.secret, {
    algorithm: ALGORITHM,
    subject: user.id,
    jwtid: crypto.randomUUID(),
    expiresIn: accessTokenTtlSeconds,
  });
}

// Returns the token's claims, or throws a 401 HttpError.
function verifyAccessToken(token) {
  let payload;
  try {
    // Pinning the algorithm stops attackers from sending tokens signed with "none" or another algorithm.
    payload = jwt.verify(token, jwtConfig.secret, { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new HttpError(401, 'TOKEN_EXPIRED', 'Access token has expired');
    }
    throw new HttpError(401, 'INVALID_TOKEN', 'Access token is invalid');
  }
  if (!payload.sub || !payload.role || !payload.tenant_id) {
    throw new HttpError(401, 'INVALID_TOKEN', 'Access token is invalid');
  }
  return payload;
}

// The refresh token is 32 random bytes — unguessable, so a fast SHA-256 hash is enough to store it.
// (bcrypt would not work here: it salts, so we couldn't look the token up by its hash.)
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + jwtConfig.refreshTokenDays * 24 * 60 * 60 * 1000),
  };
}

// The value for users.tokens_valid_after: access tokens issued before it are rejected. A JWT's iat
// is in whole seconds, so this is rounded down to a whole second too; otherwise the tokens issued
// right after a password change, in the same second, would be rejected as well.
function revocationCutoff(now = new Date()) {
  return new Date(Math.floor(now.getTime() / 1000) * 1000);
}

// True if these claims were issued before the user's cut-off.
function issuedBeforeCutoff(claims, tokensValidAfter) {
  return Boolean(tokensValidAfter) && claims.iat * 1000 < new Date(tokensValidAfter).getTime();
}

module.exports = {
  revocationCutoff,
  issuedBeforeCutoff,
  accessTokenTtlSeconds,
  signAccessToken,
  verifyAccessToken,
  hashRefreshToken,
  generateRefreshToken,
};
