const jwt = require('jsonwebtoken');
const { Employee } = require('../models');

const ROLES = { SUPER_ADMIN: 'SuperAdmin', ADMIN: 'Admin', STAFF: 'Staff', STUDENT: 'Student' };

// HR endpoints only ever grant manager-level access to Admin/SuperAdmin — treat
// both as "HR Manager" since the brief's canonical role list has no separate HR role.
const HR_MANAGER_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

// Identity comes from one of two places:
//  1. `Authorization: Bearer <jwt>` — verified with the shared JWT_SECRET.
//     Payload: { id, role, employeeId? }.
//  2. `x-user-id` / `x-user-role` headers injected by the API Gateway, which has
//     already verified the token (see gateway/README.md — downstream services
//     "trust the headers forwarded by the Gateway"). This is only safe because
//     hr-service is `expose`d inside the docker network and never published to
//     the host; the gateway is the only way in.
// A self-service caller's Employee row is found via `employeeId` in the token,
// or by matching Employee.userId to the auth user's id.
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (token) {
      try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
      } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } else if (req.headers['x-user-id'] && req.headers['x-user-role']) {
      req.user = { id: Number(req.headers['x-user-id']), role: req.headers['x-user-role'] };
    } else {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    if (!req.user.employeeId && req.user.id) {
      const linked = await Employee.findOne({ where: { userId: req.user.id }, attributes: ['id'] });
      if (linked) req.user.employeeId = linked.id;
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

// Allows access if the caller is an HR manager, OR if they are the employee
// the resource belongs to.
function requireSelfOrManager(paramName = 'employeeId') {
  return (req, res, next) => {
    if (HR_MANAGER_ROLES.includes(req.user.role)) return next();
    const targetId = Number(req.params[paramName]);
    if (req.user.employeeId && Number(req.user.employeeId) === targetId) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

module.exports = { authenticate, requireRole, requireSelfOrManager, ROLES, HR_MANAGER_ROLES };
