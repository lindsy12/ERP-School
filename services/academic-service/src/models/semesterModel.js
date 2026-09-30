const pool = require('../db');

// Data-access functions for the `semesters` table.

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

// All semesters, oldest first.
async function listSemesters(db = pool) {
  const [rows] = await db.query('SELECT id, name, start_date, end_date FROM semesters ORDER BY start_date');
  return rows;
}

async function createSemester({ name, startDate, endDate }, db = pool) {
  const [result] = await db.query(
    'INSERT INTO semesters (name, start_date, end_date) VALUES (?, ?, ?)',
    [name, startDate, endDate]
  );
  return getSemesterById(result.insertId, db);
}

module.exports = {
  getSemesterById,
  listSemesters,
  createSemester,
};
