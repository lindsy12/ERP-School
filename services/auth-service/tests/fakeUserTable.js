// In-memory stand-in for the users table, for test files that jest.mock('../src/models/user.model').
// Call fakeUserTable(userModel) in beforeEach, after jest.resetAllMocks().
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { hashPassword } = require('../src/utils/password');

const PASSWORD = 'Correct-Password-1';

// What findById returns: no password hash, no failed-login counter.
const withoutSecrets = ({ password_hash: _hash, failed_login_attempts: _count, ...row }) => ({ ...row });

function fakeUserTable(userModel) {
  const rows = new Map();
  const sessionsEndedFor = []; // user ids whose sessions were revoked, in order
  let created = 0;

  const newRow = (fields) => ({
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    tokens_valid_after: null,
    created_at: new Date(Date.now() + created++), // distinct, so "newest first" is well defined
    ...fields,
  });

  async function add({ role, tenantId, email, password = PASSWORD, isActive = true }) {
    const row = newRow({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      email: email ?? `${role.toLowerCase()}${created}@school.test`,
      role,
      password_hash: await hashPassword(password),
      is_active: isActive ? 1 : 0,
    });
    rows.set(row.id, row);
    return row;
  }

  userModel.findById.mockImplementation(async (id) => (rows.has(id) ? withoutSecrets(rows.get(id)) : null));
  userModel.findCredentialsById.mockImplementation(async (id) => (rows.has(id) ? { ...rows.get(id) } : null));
  userModel.findByTenantAndEmail.mockImplementation(async (tenantId, email) => {
    const row = [...rows.values()].find((r) => r.tenant_id === tenantId && r.email === email);
    return row ? { ...row } : null;
  });
  userModel.listByTenant.mockImplementation(async ({ tenantId, role, limit, offset }) => {
    const matching = [...rows.values()]
      .filter((r) => r.tenant_id === tenantId && (!role || r.role === role))
      .sort((a, b) => b.created_at - a.created_at);
    return { rows: matching.slice(offset, offset + limit).map(withoutSecrets), total: matching.length };
  });
  userModel.create.mockImplementation(async ({ id, tenantId, email, passwordHash, role }) => {
    if ([...rows.values()].some((r) => r.tenant_id === tenantId && r.email === email)) {
      throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
    }
    rows.set(id, newRow({ id, tenant_id: tenantId, email, role, password_hash: passwordHash }));
  });
  userModel.update.mockImplementation(async (id, { role, isActive }) => {
    const row = rows.get(id);
    if (role !== undefined) row.role = role;
    if (isActive !== undefined) row.is_active = isActive ? 1 : 0;
    if (isActive === false) sessionsEndedFor.push(id);
  });
  userModel.setPassword.mockImplementation(async (id, passwordHash, tokensValidAfter) => {
    Object.assign(rows.get(id), {
      password_hash: passwordHash,
      tokens_valid_after: tokensValidAfter,
      failed_login_attempts: 0,
      locked_until: null,
    });
    sessionsEndedFor.push(id);
  });
  userModel.recordFailedLogin.mockImplementation(async (id, computeNext) => {
    const row = rows.get(id);
    const next = computeNext({ failed_login_attempts: row.failed_login_attempts, locked_until: row.locked_until });
    Object.assign(row, { failed_login_attempts: next.failedAttempts, locked_until: next.lockedUntil });
    return next;
  });
  userModel.resetFailedLogins.mockImplementation(async (id) => {
    Object.assign(rows.get(id), { failed_login_attempts: 0, locked_until: null });
  });

  return { rows, add, sessionsEndedFor };
}

// A signed access token for a row, optionally issued some seconds ago.
function accessTokenFor(row, { issuedSecondsAgo = 0 } = {}) {
  const iat = Math.floor(Date.now() / 1000) - issuedSecondsAgo;
  return jwt.sign({ role: row.role, tenant_id: row.tenant_id, iat }, 'test-secret', {
    algorithm: 'HS256',
    subject: row.id,
    jwtid: crypto.randomUUID(),
    expiresIn: 60,
  });
}

module.exports = { fakeUserTable, accessTokenFor, PASSWORD };
