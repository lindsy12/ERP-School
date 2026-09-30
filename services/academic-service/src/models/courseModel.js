const pool = require('../db');

// Data-access functions for `courses` and `course_prerequisites`.
// Each function runs exactly one SQL query. Every function takes an optional `db` argument
// (defaults to the shared pool). When the controller needs several queries to succeed or fail
// together (e.g. create a course and link its prerequisites), it passes a transaction connection.

const COURSE_COLUMNS =
  'id, program_id, code, title, description, credit_hours, created_at';

// Inserts a new course and returns its auto-generated id.
// Why: prerequisites are stored in a separate table and need this id to link to.
async function createCourse(
  { program_id, code, title, description = null, credit_hours },
  db = pool
) {
  const [result] = await db.query(
    `INSERT INTO courses (program_id, code, title, description, credit_hours)
     VALUES (?, ?, ?, ?, ?)`,
    [program_id, code, title, description, credit_hours]
  );
  return result.insertId;
}

// Returns a single course row by id, or null if not found.
// Why: used by GET /courses/:id and to confirm a course exists before updating it.
// Prerequisites are fetched separately by getPrerequisitesForCourse.
async function getCourseById(id, db = pool) {
  const [rows] = await db.query(
    `SELECT ${COURSE_COLUMNS} FROM courses WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

// Returns all courses, ordered by id.
// Why: backs GET /courses. It deliberately doesn't load prerequisites, so the list
// stays a single cheap query. Callers that need prerequisites fetch one course.
async function listCourses(db = pool) {
  const [rows] = await db.query(
    `SELECT ${COURSE_COLUMNS} FROM courses ORDER BY id`
  );
  return rows;
}

// Overwrites a course's editable fields. Returns the number of rows matched (0 = not found).
// Why: backs PUT /courses/:id, which is a full replacement of these fields.
async function updateCourse(
  id,
  { program_id, code, title, description = null, credit_hours },
  db = pool
) {
  const [result] = await db.query(
    `UPDATE courses
        SET program_id = ?, code = ?, title = ?, description = ?, credit_hours = ?
      WHERE id = ?`,
    [program_id, code, title, description, credit_hours, id]
  );
  // affectedRows counts matched rows by default in mysql2, so an update that changes
  // nothing on an existing course still returns 1 and is not mistaken for "not found".
  return result.affectedRows;
}

// Deletes a course. Returns the number of rows deleted (0 = not found).
// Why: backs DELETE /courses/:id. Its own prerequisite links are removed automatically
// (ON DELETE CASCADE). If another course lists this one as a prerequisite, MySQL rejects
// the delete (ON DELETE RESTRICT) and the controller turns that into a 409.
async function deleteCourse(id, db = pool) {
  const [result] = await db.query('DELETE FROM courses WHERE id = ?', [id]);
  return result.affectedRows;
}

// Given a list of course ids, returns the subset that actually exist.
// Why: lets the controller report exactly which prerequisite ids are invalid (a clear 400)
// instead of surfacing a generic foreign-key error from MySQL.
async function getExistingCourseIds(ids, db = pool) {
  if (ids.length === 0) return [];
  // mysql2 expands an array bound to `IN (?)` into `IN (1, 2, 3)`.
  const [rows] = await db.query('SELECT id FROM courses WHERE id IN (?)', [ids]);
  return rows.map((row) => row.id);
}

// Links one prerequisite to a course.
// Why: a course with several prerequisites becomes several rows in course_prerequisites.
async function addPrerequisite(courseId, prerequisiteCourseId, db = pool) {
  await db.query(
    'INSERT INTO course_prerequisites (course_id, prerequisite_course_id) VALUES (?, ?)',
    [courseId, prerequisiteCourseId]
  );
}

// Removes every prerequisite link for a course.
// Why: when PUT sends a new prerequisite list, the old links are cleared and the new
// ones inserted. This is simpler and safer than diffing the old and new lists.
async function removeAllPrerequisites(courseId, db = pool) {
  await db.query('DELETE FROM course_prerequisites WHERE course_id = ?', [courseId]);
}

// Returns the full course rows (id, code, title, credit_hours) that a course requires.
// Why: GET /courses/:id should show readable prerequisites, not just bare ids,
// so we JOIN back to `courses` to resolve each prerequisite id.
async function getPrerequisitesForCourse(courseId, db = pool) {
  const [rows] = await db.query(
    `SELECT c.id, c.code, c.title, c.credit_hours
       FROM course_prerequisites cp
       JOIN courses c ON c.id = cp.prerequisite_course_id
      WHERE cp.course_id = ?
      ORDER BY c.code`,
    [courseId]
  );
  return rows;
}

module.exports = {
  createCourse,
  getCourseById,
  listCourses,
  updateCourse,
  deleteCourse,
  getExistingCourseIds,
  addPrerequisite,
  removeAllPrerequisites,
  getPrerequisitesForCourse,
};
