// Who is calling. The gateway verifies the access token with auth-service, removes any identity
// headers a client sent, and forwards x-user-id / x-user-role / x-tenant-id (docs/gateway.md).
// academic-service is only reachable on the Docker network, so these headers can be trusted.

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];

function identify(req, res, next) {
  const id = req.headers['x-user-id'];
  const role = req.headers['x-user-role'];
  if (!id || !role) {
    return res.status(401).json({ error: 'Missing user identity; call this API through the gateway' });
  }
  req.user = {
    id: String(id),
    role: String(role),
    tenantId: req.headers['x-tenant-id'] ? String(req.headers['x-tenant-id']) : null,
  };
  return next();
}

// Students may read, and file a grade appeal. Every other change is staff work.
const STUDENT_WRITES = [/^\/grades\/\d+\/appeals$/];

function staffWritesOnly(req, res, next) {
  const reading = req.method === 'GET' || req.method === 'HEAD';
  if (reading || STAFF_ROLES.includes(req.user.role)) return next();
  if (req.method === 'POST' && STUDENT_WRITES.some((pattern) => pattern.test(req.path))) return next();
  return res.status(403).json({ error: 'You do not have permission to perform this action' });
}

module.exports = { identify, staffWritesOnly, STAFF_ROLES };
