// SQL queries for the users table. Only this file (and seed.js) talks to it directly.
const pool = require('../config/db');

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
    `SELECT u.id, u.tenant_id, u.email, u.is_active, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    [id],
  );
  return rows[0] || null;
}

// Records a wrong password. computeNext({ failed_login_attempts, locked_until }) returns the new
// { failedAttempts, lockedUntil }. The row is locked while it runs, so wrong passwords sent at the
// same moment are counted one after the other and none of them is lost.
async function recordFailedLogin(id, computeNext) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT failed_login_attempts, locked_until FROM users WHERE id = ? FOR UPDATE',
      [id],
    );
    const next = computeNext(rows[0]);
    await conn.query(
      'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
      [next.failedAttempts, next.lockedUntil, id],
    );
    await conn.commit();
    return next;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// After a successful login or an admin unlock.
async function resetFailedLogins(id) {
  await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [id]);
}

module.exports = { findByTenantAndEmail, findById, recordFailedLogin, resetFailedLogins };
