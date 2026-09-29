// Requires "Authorization: Bearer <access_token>" and puts the token's user on req.user.
//
// The signature and expiry are checked first (no database needed to reject a forged token). Then
// the user is read from the database, so a disabled account, a role change, a logout or a password
// change counts from the very next request. req.user's role comes from the database, not the token.
const HttpError = require('../utils/httpError');
const { verifyAccessToken } = require('../services/token.service');
const { resolveTokenUser } = require('../services/auth.service');

async function authenticate(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  if (!match) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header');
  }

  const claims = verifyAccessToken(match[1]);
  req.user = await resolveTokenUser(claims);
  req.accessToken = { jti: claims.jti, expiresAt: new Date(claims.exp * 1000) }; // for logout
  next();
}

module.exports = authenticate;
