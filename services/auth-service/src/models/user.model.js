// SQL queries for the users table. Only this file (and seed.js) talks to it directly.
const pool = require('../config/db');

// Everything about a user except secrets (password hash, failed-login counter).
const USER_COLUMNS = `u.id, u.tenant_id, u.email, u.is_active, u.locked_until, u.tokens_valid_after,
            u.created_at, r.name AS role`;

// Used by login — includes password_hash, so never send this object to a client.
async function findByTenantAndEmail(tenantId, email) {
  const [rows] = await pool.query(
    `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.is_active,
            u.failed_login_attempts, u.locked_until, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.tenant_id = ? AND u.email = ?`,
    [tenantId, email],
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS}
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    [id],
  );
  return rows[0] || null;
}

// Used by change-password — includes password_hash, so never send this object to a client.
async function findCredentialsById(id) {
  const [rows] = await pool.query(
    `SELECT id, tenant_id, password_hash, failed_login_attempts, locked_until
       FROM users
      WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

// One page of a school's users, newest first, plus how many there are in total.
async function listByTenant({ tenantId, role, limit, offset }) {
  const where = ['u.tenant_id = ?'];
  const params = [tenantId];
  if (role) {
    where.push('r.name = ?');
    params.push(role);
  }
  const from = `FROM users u JOIN roles r ON r.id = u.role_id WHERE ${where.join(' AND ')}`;

  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS} ${from} ORDER BY u.created_at DESC, u.id LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
  return { rows, total: Number(total) };
}

// Throws mysql2's ER_DUP_ENTRY if the email is already used in this school.
async function create({ id, tenantId, email, passwordHash, role }) {
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, role_id)
     SELECT ?, ?, ?, ?, id FROM roles WHERE name = ?`,
    [id, tenantId, email, passwordHash, role],
  );
}

async function inTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Ends every login session of the user (the same as logging out everywhere). It writes the token
// tables, which belong to refreshToken.model.js, but runs here so it shares the caller's transaction.
async function revokeAllSessions(conn, userId, now) {
  await conn.query(
    'UPDATE token_families SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    [now, userId],
  );
  await conn.query(
    `UPDATE refresh_tokens t
       JOIN token_families f ON f.id = t.family_id
        SET t.revoked_at = ?
      WHERE f.user_id = ? AND t.revoked_at IS NULL`,
    [now, userId],
  );
}

// Changes role and/or is_active (undefined = leave as is). Disabling an account also ends its sessions.
async function update(id, { role, isActive }, now = new Date()) {
  const sets = [];
  const params = [];
  if (role !== undefined) {
    sets.push('role_id = (SELECT id FROM roles WHERE name = ?)');
    params.push(role);
  }
  if (isActive !== undefined) {
    sets.push('is_active = ?');
    params.push(isActive);
  }
  if (sets.length === 0) return;

  await inTransaction(async (conn) => {
    await conn.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    if (isActive === false) await revokeAllSessions(conn, id, now);
  });
}

// New password, in one transaction with its consequences: every session ends, access tokens issued
// before tokensValidAfter stop working, and any lockout is cleared.
async function setPassword(id, passwordHash, tokensValidAfter) {
  await inTransaction(async (conn) => {
    await conn.query(
      `UPDATE users
          SET password_hash = ?, tokens_valid_after = ?, failed_login_attempts = 0, locked_until = NULL
        WHERE id = ?`,
      [passwordHash, tokensValidAfter, id],
    );
    await revokeAllSessions(conn, id, tokensValidAfter);
  });
}

// Records a wrong password. computeNext({ failed_login_attempts, locked_until }) returns the new
// { failedAttempts, lockedUntil }. The row is locked while it runs, so wrong passwords sent at the
// same moment are counted one after the other and none of them is lost.
async function recordFailedLogin(id, computeNext) {
  return inTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT failed_login_attempts, locked_until FROM users WHERE id = ? FOR UPDATE',
      [id],
    );
    const next = computeNext(rows[0]);
    await conn.query(
      'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
      [next.failedAttempts, next.lockedUntil, id],
    );
    return next;
  });
}

// After a successful login or an admin unlock.
async function resetFailedLogins(id) {
  await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [id]);
}

module.exports = {
  findByTenantAndEmail,
  findById,
  findCredentialsById,
  listByTenant,
  create,
  update,
  setPassword,
  recordFailedLogin,
  resetFailedLogins,
};
