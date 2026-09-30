const HttpError = require('../utils/httpError');

// Who is calling. The gateway verifies the access token with auth-service, removes any identity
// headers a client sent, and forwards x-user-id / x-user-role / x-tenant-id (docs/gateway.md).
// notification-service is only reachable on the Docker network, so these headers can be trusted.
function identify(req, res, next) {
  const id = req.headers['x-user-id'];
  const role = req.headers['x-user-role'];
  if (!id || !role) {
    return next(new HttpError(401, 'UNAUTHORIZED', 'Missing user identity; call this API through the gateway'));
  }
  req.user = {
    id: String(id),
    role: String(role),
    tenantId: req.headers['x-tenant-id'] ? String(req.headers['x-tenant-id']) : null,
  };
  return next();
}

module.exports = identify;
