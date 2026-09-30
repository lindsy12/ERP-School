const pool = require('../db');

// Data-access functions for the `students` table.

// Returns a single student by id, or null if not found.
// Why: enrollment needs to confirm the student exists before enrolling them (clear 400),
// and the student-enrollments list needs it to tell "unknown student" (404) apart from
// "student with no enrollments" (empty list).
async function getStudentById(id, db = pool) {
  const [rows] = await db.query(
    `SELECT id, first_name, last_name, email, enrollment_date, created_at
       FROM students WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

// All students, by last name.
async function listStudents(db = pool) {
  const [rows] = await db.query(
    `SELECT id, first_name, last_name, email, enrollment_date, created_at
       FROM students ORDER BY last_name, first_name`
  );
  return rows;
}

async function createStudent({ firstName, lastName, email }, db = pool) {
  const [result] = await db.query(
    'INSERT INTO students (first_name, last_name, email) VALUES (?, ?, ?)',
    [firstName, lastName, email]
  );
  return getStudentById(result.insertId, db);
}

module.exports = {
  getStudentById,
  listStudents,
  createStudent,
};
