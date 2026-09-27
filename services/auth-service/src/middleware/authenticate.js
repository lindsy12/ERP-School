// Requires "Authorization: Bearer <access_token>" and puts the token's user on req.user.
const HttpError = require('../utils/httpError');
const { verifyAccessToken } = require('../services/token.service');

function authenticate(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  if (!match) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header');
  }

  const claims = verifyAccessToken(match[1]);
  req.user = { id: claims.sub, role: claims.role, tenant_id: claims.tenant_id, jti: claims.jti };
  next();
}

module.exports = authenticate;
