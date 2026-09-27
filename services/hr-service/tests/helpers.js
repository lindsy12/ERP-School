const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sequelize, Employee } = require('../src/models');

// Fixed for the whole test suite so fixtures created in one test are visible to
// tokens minted in another, matching how one school's data stays isolated from
// another's in the real, multi-tenant system (see middleware/auth.js).
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999';
const ADMIN_USER_ID = '11111111-1111-4111-8111-1000000000aa';

async function resetDb() {
  await sequelize.sync({ force: true });
}

function sign(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET);
}

// A manager token — managers aren't necessarily linked to an Employee row.
function adminToken(tenantId = TENANT_ID) {
  return sign({ sub: ADMIN_USER_ID, role: 'ADMIN', tenant_id: tenantId });
}

// A Staff token for a specific Employee row's id. Stamps that row's `userId`
// with a deterministic UUID (if not already set) so middleware/auth.js's
// userId->employeeId lookup finds it — mirrors linking a real login account
// via the employee form's "Auth user ID" field.
async function staffToken(employeeId, tenantId = TENANT_ID) {
  const employee = await Employee.findByPk(employeeId);
  let { userId } = employee;
  if (!userId) {
    userId = `22222222-2222-4222-8222-${String(employeeId).padStart(12, '0')}`;
    await employee.update({ userId });
  }
  return sign({ sub: userId, role: 'STAFF', tenant_id: tenantId });
}

// A token for a bare role, not linked to any Employee row — for tests that only
// care about RBAC (can/can't reach an endpoint), not about self-service identity.
function roleToken(role, tenantId = TENANT_ID) {
  return sign({ sub: crypto.randomUUID(), role, tenant_id: tenantId });
}

module.exports = {
  resetDb, sign, adminToken, staffToken, roleToken, TENANT_ID, OTHER_TENANT_ID, ADMIN_USER_ID,
};
