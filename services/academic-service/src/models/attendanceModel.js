const pool = require('../db');

// Data-access functions for `class_sessions` and `attendance_records`.
// Like the other models: SQL only, no HTTP logic, and an optional `db` argument (defaults to
// the shared pool) so a caller can pass a transaction connection.
//
// Dates: session_date is selected with DATE_FORMAT(..., '%Y-%m-%d') so it comes back as the
// plain string "2026-09-07". Otherwise mysql2 returns a JS Date at local midnight, which
// JSON-serialises in UTC and can show up as the *previous* day.

const SESSION_COLUMNS = `id, course_id, semester_id,
  DATE_FORMAT(session_date, '%Y-%m-%d') AS session_date,
  start_time, end_time, created_at`;

// Inserts a class session and returns its new id.
// Why: attendance is always recorded against a specific session, so sessions come first.
async function createClassSession(courseId, semesterId, date, startTime, endTime, db = pool) {
  const [result] = await db.query(
    `INSERT INTO class_sessions (course_id, semester_id, session_date, start_time, end_time)
     VALUES (?, ?, ?, ?, ?)`,
    [courseId, semesterId, date, startTime, endTime]
  );
  return result.insertId;
}

// Returns one class session by id, or null if not found.
// Why: to return a created session, and to find which course/semester a session belongs to
// before recording attendance for it.
async function getClassSessionById(id, db = pool) {
  const [rows] = await db.query(
    `SELECT ${SESSION_COLUMNS} FROM class_sessions WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

// Given a list of student ids, returns those actively enrolled (not dropped) in the course
// for that semester.
// Why: attendance and grades only make sense for students actually taking the course, and
// returning the enrolled subset lets the controller name exactly who isn't enrolled.
// (This is an enrollments query, so it would normally live in enrollmentModel; that file is
// frozen for now. Move it there when enrollment code is next touched.)
async function getEnrolledStudentIds(courseId, semesterId, studentIds, db = pool) {
  if (studentIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT student_id FROM enrollments
      WHERE course_id = ? AND semester_id = ? AND status = 'enrolled'
        AND student_id IN (?)`,
    [courseId, semesterId, studentIds]
  );
  return rows.map((row) => row.student_id);
}

// Saves attendance for a whole session at once. `records` is [{ studentId, status }].
//
// Why a transaction: the class register is all-or-nothing. If any row fails (e.g. a student
// already marked for this session hits the UNIQUE key), nothing from the batch is kept, so a
// session is never left half-recorded. All rows go in one multi-row INSERT
// (mysql2 expands `VALUES ?` with an array of arrays into (..),(..),(..)). A single statement
// is already atomic in InnoDB; the explicit transaction states the guarantee plainly and
// keeps it if more statements are added later (e.g. updating an at-risk flag).
// Unlike the other model functions, this one manages its own connection because the
// transaction is part of what the function promises.
async function recordAttendance(sessionId, records) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = records.map((r) => [sessionId, r.studentId, r.status]);
    await conn.query(
      'INSERT INTO attendance_records (session_id, student_id, status) VALUES ?',
      [rows]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Returns the attendance register for one session, with student names, ordered by surname.
// Why the JOIN: a register of bare student ids isn't readable by a teacher or admin.
async function getAttendanceForSession(sessionId, db = pool) {
  const [rows] = await db.query(
    `SELECT ar.id, ar.student_id, s.first_name, s.last_name, ar.status, ar.recorded_at
       FROM attendance_records ar
       JOIN students s ON s.id = ar.student_id
      WHERE ar.session_id = ?
      ORDER BY s.last_name, s.first_name`,
    [sessionId]
  );
  return rows;
}

// Returns every attendance record for one student, newest session first, with the course
// and semester it belongs to.
// Why: backs the student's attendance history in GET /students/:studentId/attendance.
async function getAttendanceForStudent(studentId, db = pool) {
  const [rows] = await db.query(
    `SELECT ar.id, ar.session_id,
            DATE_FORMAT(cs.session_date, '%Y-%m-%d') AS session_date,
            cs.start_time, cs.end_time,
            cs.course_id, c.code AS course_code, c.title AS course_title,
            cs.semester_id, sem.name AS semester_name,
            ar.status, ar.recorded_at
       FROM attendance_records ar
       JOIN class_sessions cs ON cs.id = ar.session_id
       JOIN courses c         ON c.id = cs.course_id
       JOIN semesters sem     ON sem.id = cs.semester_id
      WHERE ar.student_id = ?
      ORDER BY cs.session_date DESC, cs.start_time DESC`,
    [studentId]
  );
  return rows;
}

// WHAT: returns a student's overall attendance as
//   { totalSessions, presentSessions, lateSessions, percentage }
// where percentage = presentSessions / totalSessions * 100, rounded to 2 decimals, or null
// when there are no sessions yet (so we never divide by zero or show a misleading 0%).
//
// WHY: this is the number the at-risk-student flag (built next) will check against a
// threshold, e.g. "below 75% attendance". It is computed from the data every time instead of
// stored, so it can never drift out of sync with the attendance records.
//
// Which sessions count (totalSessions):
//   - sessions of every course/semester the student is actively enrolled in (dropped
//     courses are excluded, so a dropped course doesn't hurt them), and
//   - only sessions where attendance has actually been taken (at least one record exists).
//     Future sessions, and past ones the teacher hasn't marked yet, don't drag the
//     percentage down. But if a register *was* taken and this student isn't on it, that
//     session counts as not present.
// 'late' is NOT counted as present, since the spec counts present sessions only. lateSessions
// is returned separately so the at-risk logic can decide whether late should count.
async function getAttendancePercentageForStudent(studentId, db = pool) {
  const [rows] = await db.query(
    `SELECT COUNT(*)                          AS total_sessions,
            COALESCE(SUM(ar.status = 'present'), 0) AS present_sessions,
            COALESCE(SUM(ar.status = 'late'), 0)    AS late_sessions
       FROM enrollments e
       JOIN class_sessions cs
         ON cs.course_id = e.course_id AND cs.semester_id = e.semester_id
       LEFT JOIN attendance_records ar
         ON ar.session_id = cs.id AND ar.student_id = e.student_id
      WHERE e.student_id = ?
        AND e.status = 'enrolled'
        AND EXISTS (SELECT 1 FROM attendance_records taken WHERE taken.session_id = cs.id)`,
    [studentId]
  );
  // MySQL returns SUM() as DECIMAL, which mysql2 hands back as a string ("3"), so convert.
  const totalSessions = Number(rows[0].total_sessions);
  const presentSessions = Number(rows[0].present_sessions);
  const lateSessions = Number(rows[0].late_sessions);
  const percentage =
    totalSessions === 0 ? null : Math.round((presentSessions / totalSessions) * 10000) / 100;
  return { totalSessions, presentSessions, lateSessions, percentage };
}

module.exports = {
  createClassSession,
  getClassSessionById,
  getEnrolledStudentIds,
  recordAttendance,
  getAttendanceForSession,
  getAttendanceForStudent,
  getAttendancePercentageForStudent,
};
