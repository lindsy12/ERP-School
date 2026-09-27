// Creates the first SUPER_ADMIN account from environment variables.
// Safe to run more than once: if the account already exists it is left untouched.
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { db } = require('../config/env');
const { hashPassword } = require('../utils/password');

const MIN_PASSWORD_LENGTH = 12;

async function seed() {
  const tenantId = process.env.SEED_TENANT_ID?.trim();
  const email = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!tenantId || !email || !password) {
    throw new Error('Set SEED_TENANT_ID, SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD first');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SEED_SUPERADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const conn = await mysql.createConnection({ ...db, timezone: 'Z' });
  try {
    const [roles] = await conn.query('SELECT id FROM roles WHERE name = ?', ['SUPER_ADMIN']);
    if (roles.length === 0) {
      throw new Error('SUPER_ADMIN role not found. Run `npm run migrate` first.');
    }

    const [existing] = await conn.query(
      'SELECT id FROM users WHERE tenant_id = ? AND email = ?',
      [tenantId, email],
    );
    if (existing.length > 0) {
      console.log(`SUPER_ADMIN ${email} already exists, nothing to do.`);
      return;
    }

    await conn.query(
      'INSERT INTO users (id, tenant_id, email, password_hash, role_id) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), tenantId, email, await hashPassword(password), roles[0].id],
    );
    console.log(`Created SUPER_ADMIN ${email}.`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  });
}

module.exports = seed;
