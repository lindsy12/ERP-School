const jwt = require('jsonwebtoken');
const HttpError = require('../utils/httpError');
const { Employee } = require('../models');

// Canonical role names — set by auth-service (services/auth-service/src/db/migrations/001_create_roles.sql)
// and forwarded verbatim in x-user-role. See docs/api-contracts/auth-service.md.
const ROLES = { SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN', STAFF: 'STAFF', STUDENT: 'STUDENT' };
const HR_MANAGER_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

// Identity comes from one of two places:
//  1. The API Gateway, which has already verified the token against auth-service and forwards
//     `x-user-id` (UUID) / `x-user-role` / `x-tenant-id` (UUID) — see docs/gateway.md and
//     CLAUDE.md's "Downstream services trust the forwarded headers". This is the only path used
//     in the real system; it's safe because hr-service is `expose`d, never published to the host,
//     and the gateway strips any of these headers a client tries to send itself.
//  2. `Authorization: Bearer <jwt>` verified directly with the shared JWT_SECRET — DEV-ONLY, for
//     working on hr-service without the gateway or auth-service running (see scripts/dev-token.js).
//     Claims mirror auth-service's access token: { sub, role, tenant_id }.
// Either way this sets req.user = { id, role, tenantId, employeeId? }. `employeeId` is hr-service's
// own concept (auth-service knows nothing about it) and is looked up from Employee.userId.
async function authenticate(req, res, next) {
  try {
    if (req.headers['x-user-id'] && req.headers['x-user-role']) {
      req.user = {
        id: String(req.headers['x-user-id']),
        role: req.headers['x-user-role'],
        tenantId: req.headers['x-tenant-id'] ? String(req.headers['x-tenant-id']) : null,
      };
    } else {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) return next(new HttpError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header'));
      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
      } catch (err) {
        return next(new HttpError(401, 'INVALID_TOKEN', 'Access token is invalid'));
      }
      req.user = { id: String(payload.sub || payload.id), role: payload.role, tenantId: payload.tenant_id ? String(payload.tenant_id) : null };
    }

    if (req.user.id && req.user.tenantId) {
      const linked = await Employee.findOne({ where: { userId: req.user.id, tenantId: req.user.tenantId }, attributes: ['id'] });
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
      return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
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
    return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
  };
}

module.exports = { authenticate, requireRole, requireSelfOrManager, ROLES, HR_MANAGER_ROLES };
