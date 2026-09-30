const pool = require('../db');

// Data-access functions for the `programs` table.
// Each function runs exactly one SQL query and returns plain data, with no HTTP logic.
// Keeping SQL here (and out of controllers) means a query change happens in one place.
// Every function takes an optional `db` argument (defaults to the shared pool) so a
// caller can pass a transaction connection instead.

// Inserts a new program and returns its auto-generated id.
// Why: the controller needs the id to fetch and return the full created row.
async function createProgram({ name, description = null }, db = pool) {
  const [result] = await db.query(
    'INSERT INTO programs (name, description) VALUES (?, ?)',
    [name, description]
  );
  return result.insertId;
}

// Returns every program, oldest first.
// Why: backs GET /programs; a stable ORDER BY keeps the response order predictable.
async function listPrograms(db = pool) {
  const [rows] = await db.query(
    'SELECT id, name, description, created_at FROM programs ORDER BY id'
  );
  return rows;
}

// Returns a single program by id, or null if it doesn't exist.
// Why: used to return a newly created program, and to check that a course's
// program_id points at a real program before inserting the course.
async function getProgramById(id, db = pool) {
  const [rows] = await db.query(
    'SELECT id, name, description, created_at FROM programs WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  createProgram,
  listPrograms,
  getProgramById,
};
