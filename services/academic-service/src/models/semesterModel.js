const pool = require('../db');

// Data-access functions for the `semesters` table.
// There are no semester CRUD endpoints yet. For now this only supports enrollment lookups.

// Returns a single semester by id, or null if not found.
// Why: enrollment must confirm the target semester exists before inserting (clear 400
// instead of a raw foreign-key error).
async function getSemesterById(id, db = pool) {
  const [rows] = await db.query(
    'SELECT id, name, start_date, end_date FROM semesters WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  getSemesterById,
};
