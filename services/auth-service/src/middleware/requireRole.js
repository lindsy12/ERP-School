// Role check for Express routes. Self-contained, so other services can copy this file as-is.
//
// Usage:
//   router.delete('/courses/:id', requireRole('ADMIN', 'SUPER_ADMIN'), deleteCourse);
//
// It expects something earlier in the chain to have set req.user = { id, role, ... }.
//   - In auth-service, middleware/authenticate.js does that from the JWT.
//   - In other services, the gateway has already verified the token, so set it from its headers:
//       app.use((req, res, next) => {
//         if (req.get('x-user-id')) {
//           req.user = { id: req.get('x-user-id'), role: req.get('x-user-role'), tenant_id: req.get('x-tenant-id') };
//         }
//         next();
//       });
//     This is safe because the gateway deletes any x-user-id / x-user-role / x-tenant-id a client sends,
//     and services are unreachable except through the gateway (see docs/gateway.md).
function requireRole(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new Error('requireRole() needs at least one role');
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' },
      });
    }
    return next();
  };
}

module.exports = requireRole;
