const pool = require('../db');

// Data-access functions for the `students` table.
// There are no student CRUD endpoints yet. For now this only supports enrollment lookups.

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

module.exports = {
  getStudentById,
};
