// Who is calling. The gateway verifies the access token with auth-service, strips any identity
// headers a client sent, and forwards x-user-id / x-user-role / x-tenant-id (docs/gateway.md).
// finance-service is only reachable on the Docker network, so these headers can be trusted.
const HttpError = require("../utils/httpError");

function identify(req, res, next) {
  const id = req.headers["x-user-id"];
  const role = req.headers["x-user-role"];
  if (!id || !role) return next(new HttpError(401, "UNAUTHORIZED", "Missing user identity; call this API through the gateway"));
  req.user = { id: String(id), role: String(role), tenantId: req.headers["x-tenant-id"] ? String(req.headers["x-tenant-id"]) : null };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action"));
    }
    next();
  };
}

module.exports = { identify, requireRole };
