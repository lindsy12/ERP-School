// SQL queries for the users table. Only this file (and seed.js) talks to it directly.
const pool = require('../config/db');

// Used by login — includes password_hash, so never send this object to a client.
async function findByTenantAndEmail(tenantId, email) {
  const [rows] = await pool.query(
    `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.is_active, r.name AS role
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

module.exports = { findByTenantAndEmail, findById };
