// SQL queries for the token_families and refresh_tokens tables.
const pool = require('../config/db');

// A login starts a new family and issues its first token. Both rows are written in one
// transaction, so there is never a family without a token or a token without a family.
async function startFamily({ familyId, userId, tokenId, tokenHash, expiresAt }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('INSERT INTO token_families (id, user_id) VALUES (?, ?)', [familyId, userId]);
    await conn.query(
      `INSERT INTO refresh_tokens (id, family_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [tokenId, familyId, tokenHash, expiresAt],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { startFamily };
