const pool = require('../db');

// Data-access functions for the `enrollments` table.
// Each function runs exactly one SQL query and takes an optional `db` argument
// (defaults to the shared pool), matching courseModel/programModel.

const ENROLLMENT_COLUMNS =
  'id, student_id, course_id, semester_id, status, enrolled_at';

// Returns the prerequisites of `courseId` that the student has NOT yet completed,
// as [{ id, code, title }]. An empty array means every prerequisite is satisfied.
//
// Why return the *missing* list instead of true/false: the controller's 409 message has to
// say exactly which courses are missing, and this answers "met?" and "which not?" in one query.
//
// How: start from the course's rows in course_prerequisites, and keep only those with
// NO matching enrollment for this student in a semester that ended before the target semester
// starts. Comparing against the target semester's start date, not today, lets a student
// register for Spring during Fall and have their Fall courses count.
//
// TODO(grades): SIMPLIFICATION, revisit once grades exist. There is no grade or completion
// tracking yet, so any 'enrolled' (i.e. not dropped) enrollment in an earlier semester is
// treated as "completed", even if the student failed. When grades are built, this should
// require a passing grade / 'completed' status instead of e.status = 'enrolled'.
async function getMissingPrerequisites(studentId, courseId, semesterId, db = pool) {
  const [rows] = await db.query(
    `SELECT c.id, c.code, c.title
       FROM course_prerequisites cp
       JOIN courses c ON c.id = cp.prerequisite_course_id
      WHERE cp.course_id = ?
        AND NOT EXISTS (
              SELECT 1
                FROM enrollments e
                JOIN semesters s ON s.id = e.semester_id
               WHERE e.student_id = ?
                 AND e.course_id = cp.prerequisite_course_id
                 AND e.status = 'enrolled'
                 AND s.end_date < (SELECT start_date FROM semesters WHERE id = ?)
            )
      ORDER BY c.code`,
    [courseId, studentId, semesterId]
  );
  return rows;
}

// Inserts an enrollment (status defaults to 'enrolled') and returns its new id.
// Why no duplicate check here: the UNIQUE key on (student_id, course_id, semester_id)
// enforces it atomically. A "check then insert" in JS could let two simultaneous
// requests both pass the check. The controller catches ER_DUP_ENTRY instead.
async function createEnrollment({ studentId, courseId, semesterId }, db = pool) {
  const [result] = await db.query(
    'INSERT INTO enrollments (student_id, course_id, semester_id) VALUES (?, ?, ?)',
    [studentId, courseId, semesterId]
  );
  return result.insertId;
}

// Returns a single enrollment row by id, or null if not found.
// Why: after inserting, we re-read the row so the response and the RabbitMQ event carry the
// real DB values (e.g. the enrolled_at timestamp MySQL generated), not values guessed in JS.
async function getEnrollmentById(id, db = pool) {
  const [rows] = await db.query(
    `SELECT ${ENROLLMENT_COLUMNS} FROM enrollments WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

// Lists every enrollment for one student, including dropped ones, with course and semester
// names joined in so the client doesn't need extra requests to display them.
// Ordered by semester start date so it reads like an academic history.
async function listEnrollmentsForStudent(studentId, db = pool) {
  const [rows] = await db.query(
    `SELECT e.id, e.student_id,
            e.course_id, c.code AS course_code, c.title AS course_title,
            e.semester_id, s.name AS semester_name,
            e.status, e.enrolled_at
       FROM enrollments e
       JOIN courses c   ON c.id = e.course_id
       JOIN semesters s ON s.id = e.semester_id
      WHERE e.student_id = ?
      ORDER BY s.start_date, c.code`,
    [studentId]
  );
  return rows;
}

module.exports = {
  getMissingPrerequisites,
  createEnrollment,
  getEnrollmentById,
  listEnrollmentsForStudent,
};
