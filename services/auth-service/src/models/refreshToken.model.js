// SQL queries for the token tables: token_families and refresh_tokens (login sessions), and
// revoked_access_tokens (access tokens ended early by logout).
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

// The queries below run on one connection, inside the transaction opened by withTransaction.
function transactionQueries(conn) {
  // Locks the token row (and its family row) until the transaction ends, so two requests
  // presenting the same token are handled one after the other, never both at once.
  async function findByHashForUpdate(tokenHash) {
    const [rows] = await conn.query(
      `SELECT t.id, t.family_id, t.expires_at, t.revoked_at,
              f.user_id, f.revoked_at AS family_revoked_at
         FROM refresh_tokens t
         JOIN token_families f ON f.id = t.family_id
        WHERE t.token_hash = ?
          FOR UPDATE`,
      [tokenHash],
    );
    return rows[0] || null;
  }

  // Ends the session: the family and every token still usable in it.
  async function revokeFamily(familyId, now = new Date()) {
    await conn.query(
      'UPDATE token_families SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      [now, familyId],
    );
    await conn.query(
      'UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL',
      [now, familyId],
    );
  }

  // Swaps oldTokenId for a new token in the same family. The new row is inserted first
  // because replaced_by is a foreign key to it.
  async function rotate({ oldTokenId, familyId, newTokenId, newTokenHash, newExpiresAt, now = new Date() }) {
    await conn.query(
      `INSERT INTO refresh_tokens (id, family_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [newTokenId, familyId, newTokenHash, newExpiresAt],
    );
    await conn.query(
      'UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?',
      [now, newTokenId, oldTokenId],
    );
  }

  return { findByHashForUpdate, revokeFamily, rotate };
}

// Runs work(queries) in one transaction: committed if work returns, rolled back if it throws.
// To keep changes AND reject the request (e.g. revoking a family on token reuse), work must
// return a result and the caller throws after the commit.
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(transactionQueries(conn));
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Logout: the access token stops working now instead of at its expiry. Rows whose token has
// expired anyway are useless, so they are cleared out here, keeping the table small.
async function revokeAccessToken({ jti, userId, expiresAt }) {
  await pool.query('DELETE FROM revoked_access_tokens WHERE expires_at < ?', [new Date()]);
  await pool.query(
    'INSERT IGNORE INTO revoked_access_tokens (jti, user_id, expires_at) VALUES (?, ?, ?)',
    [jti, userId, expiresAt],
  );
}

async function isAccessTokenRevoked(jti) {
  const [rows] = await pool.query('SELECT 1 FROM revoked_access_tokens WHERE jti = ?', [jti]);
  return rows.length > 0;
}

module.exports = { startFamily, withTransaction, revokeAccessToken, isAccessTokenRevoked };
