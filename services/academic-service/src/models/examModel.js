const pool = require('../db');

// Data-access functions for the `exams` table.
// Each function runs exactly one SQL query and takes an optional `db` argument (defaults to the
// shared pool), so the controller can run the conflict check and the write on one connection
// while holding the room lock.
//
// exam_date is returned via DATE_FORMAT as "YYYY-MM-DD". A raw DATE would come back as a JS
// Date at local midnight and could serialise as the previous day in UTC.

const EXAM_SELECT = `
  SELECT e.id, e.course_id, c.code AS course_code, c.title AS course_title,
         e.semester_id, s.name AS semester_name,
         DATE_FORMAT(e.exam_date, '%Y-%m-%d') AS exam_date,
         e.start_time, e.end_time, e.room, e.created_at
    FROM exams e
    JOIN courses c   ON c.id = e.course_id
    JOIN semesters s ON s.id = e.semester_id`;

// Inserts an exam and returns its new id.
// This does NOT check for room conflicts. The controller must call findConflictingExams first,
// while holding the room lock, and only insert if nothing conflicts.
async function createExam(courseId, semesterId, examDate, startTime, endTime, room, db = pool) {
  const [result] = await db.query(
    `INSERT INTO exams (course_id, semester_id, exam_date, start_time, end_time, room)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [courseId, semesterId, examDate, startTime, endTime, room]
  );
  return result.insertId;
}

// WHAT: returns the exams already booked in `room` on `examDate` whose time range overlaps
// [startTime, endTime), with course code/title so the 409 message can name them.
// `excludeExamId` leaves one exam out. When updating an exam, its own current booking
// obviously "overlaps" its new time, and must not count as a conflict with itself.
//
// WHY this formula: treat each exam as a half-open range [start, end), which includes the start
// minute and excludes the end minute. Two ranges A and B overlap exactly when
//
//     A.start < B.end   AND   B.start < A.end
//
// i.e. each one starts before the other one finishes. In SQL, with the new exam as A and each
// existing row as B, that's `? < e.end_time AND e.start_time < ?`.
//
// Example, with an existing booking of 09:00-11:00 in Hall A:
//   new 10:00-12:00 -> 10:00 < 11:00 and 09:00 < 12:00 -> CONFLICT (partial overlap)
//   new 09:30-10:30 -> 09:30 < 11:00 and 09:00 < 10:30 -> CONFLICT (fully inside)
//   new 08:00-13:00 -> 08:00 < 11:00 and 09:00 < 13:00 -> CONFLICT (fully surrounds; an
//                      "exact start/end match" check would miss this one)
//   new 11:00-13:00 -> 11:00 < 11:00 is false          -> OK (back-to-back is allowed,
//                      because the room is free the moment the first exam ends)
//   new 07:00-09:00 -> 09:00 < 09:00 is false          -> OK (back-to-back before it)
// TIME values compare chronologically in MySQL, so no conversion is needed.
async function findConflictingExams(examDate, startTime, endTime, room, excludeExamId = null, db = pool) {
  const [rows] = await db.query(
    `${EXAM_SELECT}
      WHERE e.room = ?
        AND e.exam_date = ?
        AND ? < e.end_time
        AND e.start_time < ?
        AND (? IS NULL OR e.id <> ?)
      ORDER BY e.start_time`,
    [room, examDate, startTime, endTime, excludeExamId, excludeExamId]
  );
  return rows;
}

// Returns one exam (with course and semester names) by id, or null if not found.
async function getExamById(id, db = pool) {
  const [rows] = await db.query(`${EXAM_SELECT} WHERE e.id = ?`, [id]);
  return rows[0] || null;
}

// Returns exams in timetable order (date, then start time, then room), optionally filtered
// by semesterId and/or courseId.
// Why build the WHERE clause from a list: each filter is optional, and adding only the conditions
// that were given, each with a `?` placeholder, keeps the query safe from SQL injection.
async function listExams({ semesterId = null, courseId = null } = {}, db = pool) {
  const conditions = [];
  const params = [];
  if (semesterId !== null) {
    conditions.push('e.semester_id = ?');
    params.push(semesterId);
  }
  if (courseId !== null) {
    conditions.push('e.course_id = ?');
    params.push(courseId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await db.query(
    `${EXAM_SELECT} ${where} ORDER BY e.exam_date, e.start_time, e.room`,
    params
  );
  return rows;
}

// Returns all exams for one course, in timetable order.
// A convenience wrapper over listExams, so "exams for a course" has one definition. Useful for
// callers such as a future course-detail page.
async function getExamsForCourse(courseId, db = pool) {
  return listExams({ courseId }, db);
}

// Overwrites every editable field of an exam. Returns rows matched (0 = not found).
// As with createExam, the controller must check for conflicts first, under the room lock.
async function updateExam(id, { courseId, semesterId, examDate, startTime, endTime, room }, db = pool) {
  const [result] = await db.query(
    `UPDATE exams
        SET course_id = ?, semester_id = ?, exam_date = ?, start_time = ?, end_time = ?, room = ?
      WHERE id = ?`,
    [courseId, semesterId, examDate, startTime, endTime, room, id]
  );
  return result.affectedRows;
}

// Deletes an exam. Returns rows deleted (0 = not found).
// Nothing references exams, so there's no foreign key to block the delete.
async function deleteExam(id, db = pool) {
  const [result] = await db.query('DELETE FROM exams WHERE id = ?', [id]);
  return result.affectedRows;
}

// ---------- per-room lock ----------
//
// WHY: "check for conflicts, then insert" is two steps. Without a lock, two requests booking
// overlapping slots in the same room can both run the check before either inserts, both see
// "no conflict", and both insert, double-booking the room. A unique key can't prevent this
// because the rule is an overlap, not an equality.
// MySQL's GET_LOCK(name, timeout) is a named mutex: while one connection holds "exam_room:hall a",
// any other connection asking for the same name waits. So bookings for the same room run one
// at a time, and different rooms don't block each other.
// The lock belongs to the *connection*. The caller must use one connection for lock -> check ->
// write -> release, and must release before returning the connection to the pool; otherwise
// the idle pooled connection would keep holding it. If a connection dies, MySQL frees its locks.

// Lock names are lower-cased and trimmed to match how the column compares room names
// (case-insensitive, trailing spaces ignored). "exam_room:" (10) + room (max 50) fits MySQL's
// 64-character lock-name limit.
function roomLockName(room) {
  return `exam_room:${room.trim().toLowerCase()}`;
}

// Waits up to `timeoutSeconds` for the room's lock. Returns true if acquired, false on timeout.
async function acquireRoomLock(room, db, timeoutSeconds = 5) {
  const [rows] = await db.query('SELECT GET_LOCK(?, ?) AS acquired', [roomLockName(room), timeoutSeconds]);
  return rows[0].acquired === 1;
}

// Releases the room's lock held by this connection.
async function releaseRoomLock(room, db) {
  await db.query('SELECT RELEASE_LOCK(?)', [roomLockName(room)]);
}

module.exports = {
  createExam,
  findConflictingExams,
  getExamById,
  listExams,
  getExamsForCourse,
  updateExam,
  deleteExam,
  acquireRoomLock,
  releaseRoomLock,
};
