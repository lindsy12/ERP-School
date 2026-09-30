const pool = require('../db');
const examModel = require('../models/examModel');
const courseModel = require('../models/courseModel');
const semesterModel = require('../models/semesterModel');
const {
  parseId,
  findMissingFields,
  parseDate,
  parseTime,
  toDateString,
} = require('../utils/validation');

// Express route handlers for /api/v1/academic/exams.
// Conflict rule: two exams conflict if they're in the SAME room, on the SAME date, and their
// time ranges overlap (see examModel.findConflictingExams for the math). Create and update
// both check this under a per-room lock, and refuse with 409 if anything overlaps.

const ROOM_MAX_LENGTH = 50; // matches exams.room VARCHAR(50)

// ---------- helpers ----------

// Validates an exam body for POST and PUT (PUT is a full replace, so the same fields are required).
// Returns { error } or { data } with cleaned values: ids as numbers, times as "HH:MM:SS",
// room trimmed.
function validateExamBody(body) {
  const missing = findMissingFields(body, [
    'courseId',
    'semesterId',
    'examDate',
    'startTime',
    'endTime',
    'room',
  ]);
  if (missing.length > 0) return { error: `Missing required field(s): ${missing.join(', ')}` };

  const courseId = parseId(body.courseId);
  const semesterId = parseId(body.semesterId);
  if (courseId === null) return { error: 'courseId must be a positive integer' };
  if (semesterId === null) return { error: 'semesterId must be a positive integer' };

  const examDate = parseDate(body.examDate);
  if (examDate === null) return { error: 'examDate must be a valid date in YYYY-MM-DD format' };

  const startTime = parseTime(body.startTime);
  const endTime = parseTime(body.endTime);
  if (startTime === null || endTime === null) {
    return { error: 'startTime and endTime must be 24-hour times like "09:00" or "09:00:00"' };
  }
  // Checked here for a clear message; the chk_exams_times constraint is the DB-level backstop.
  if (endTime <= startTime) return { error: 'endTime must be after startTime' };

  if (typeof body.room !== 'string' || body.room.trim() === '') {
    return { error: 'room must be a non-empty string' };
  }
  const room = body.room.trim();
  if (room.length > ROOM_MAX_LENGTH) {
    return { error: `room must be at most ${ROOM_MAX_LENGTH} characters` };
  }

  return { data: { courseId, semesterId, examDate, startTime, endTime, room } };
}

// Checks the course and semester exist and the exam date falls inside the semester.
// Returns an error message, or null if everything is valid.
// Why the date check: an exam dated outside its semester is almost certainly a typo
// (e.g. the wrong year), and catching it now is far cheaper than after students see it.
async function checkReferences({ courseId, semesterId, examDate }) {
  const [course, semester] = await Promise.all([
    courseModel.getCourseById(courseId),
    semesterModel.getSemesterById(semesterId),
  ]);
  if (!course) return `courseId ${courseId} does not exist`;
  if (!semester) return `semesterId ${semesterId} does not exist`;

  const start = toDateString(semester.start_date);
  const end = toDateString(semester.end_date);
  if (examDate < start || examDate > end) {
    return `examDate ${examDate} is outside ${semester.name} (${start} to ${end})`;
  }
  return null;
}

// Runs `work(conn)` while holding the per-room lock (see examModel's lock section).
// Why one dedicated connection: MySQL named locks belong to the connection that took them, so
// the lock, the conflict check and the write must all use the same one.
// The lock is always released before the connection goes back to the pool.
async function withRoomLock(room, work) {
  const conn = await pool.getConnection();
  try {
    const acquired = await examModel.acquireRoomLock(room, conn);
    if (!acquired) {
      const err = new Error(`Timed out waiting for the booking lock on room "${room}"`);
      err.code = 'ROOM_LOCK_TIMEOUT';
      throw err;
    }
    try {
      return await work(conn);
    } finally {
      await examModel.releaseRoomLock(room, conn);
    }
  } finally {
    conn.release();
  }
}

// Formats a list of conflicting exams for the 409 message,
// e.g. "CS101 09:00-11:00 (exam 3), MA201 10:30-12:00 (exam 7)".
function describeConflicts(conflicts) {
  return conflicts
    .map((e) => `${e.course_code} ${e.start_time.slice(0, 5)}-${e.end_time.slice(0, 5)} (exam ${e.id})`)
    .join(', ');
}

// Builds the 409 response body for a room clash. It includes the conflicting exams as data, so
// a UI can highlight them without parsing the message.
function conflictResponse(data, conflicts) {
  return {
    error:
      `Room "${data.room}" is already booked on ${data.examDate} at an overlapping time: ` +
      `${describeConflicts(conflicts)}. The exam was not saved.`,
    conflicts,
  };
}

// Maps errors shared by create and update to a response, or returns null if unhandled.
function handleKnownError(err, res) {
  if (err.code === 'ROOM_LOCK_TIMEOUT') {
    // Another booking for this room held the lock too long. That's temporary, so tell the
    // client to retry.
    return res.status(503).json({ error: `${err.message}; please retry` });
  }
  return null;
}

// ---------- handlers ----------

// POST /api/v1/academic/exams
// Body: { courseId, semesterId, examDate: "YYYY-MM-DD", startTime: "HH:MM", endTime: "HH:MM", room }.
// Validates (400), checks references (400), then, under the room lock, looks for overlapping
// exams in that room and date. If any exist it returns 409 naming them and saves nothing;
// otherwise it creates the exam and returns 201.
async function createExam(req, res) {
  const { error, data } = validateExamBody(req.body ?? {});
  if (error) return res.status(400).json({ error });

  try {
    const refError = await checkReferences(data);
    if (refError) return res.status(400).json({ error: refError });

    const outcome = await withRoomLock(data.room, async (conn) => {
      const conflicts = await examModel.findConflictingExams(
        data.examDate, data.startTime, data.endTime, data.room, null, conn
      );
      if (conflicts.length > 0) return { conflicts };
      const id = await examModel.createExam(
        data.courseId, data.semesterId, data.examDate, data.startTime, data.endTime, data.room, conn
      );
      return { id };
    });

    if (outcome.conflicts) return res.status(409).json(conflictResponse(data, outcome.conflicts));

    const exam = await examModel.getExamById(outcome.id);
    return res.status(201).json(exam);
  } catch (err) {
    if (handleKnownError(err, res)) return;
    console.error('createExam failed:', err);
    return res.status(500).json({ error: 'Failed to create exam' });
  }
}

// GET /api/v1/academic/exams?semesterId=&courseId=
// Lists exams in timetable order. Both query params are optional, and can be combined.
// A present but invalid filter is a 400. Silently ignoring it would return *every* exam,
// which looks like a correct answer but isn't.
async function listExams(req, res) {
  const filters = {};
  for (const name of ['semesterId', 'courseId']) {
    const raw = req.query[name];
    if (raw === undefined) continue;
    const id = parseId(raw);
    if (id === null) return res.status(400).json({ error: `${name} must be a positive integer` });
    filters[name] = id;
  }

  try {
    const exams = await examModel.listExams(filters);
    return res.json(exams);
  } catch (err) {
    console.error('listExams failed:', err);
    return res.status(500).json({ error: 'Failed to list exams' });
  }
}

// GET /api/v1/academic/exams/:id
// Returns one exam with course and semester names; 404 if it doesn't exist.
async function getExam(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });

  try {
    const exam = await examModel.getExamById(id);
    if (!exam) return res.status(404).json({ error: `Exam ${id} not found` });
    return res.json(exam);
  } catch (err) {
    console.error('getExam failed:', err);
    return res.status(500).json({ error: 'Failed to get exam' });
  }
}

// PUT /api/v1/academic/exams/:id
// Full replace (same body as POST). Re-runs the conflict check against the NEW room, date and
// times, excluding this exam's own id. Otherwise nudging an exam by 15 minutes would
// "conflict" with its own current slot. On a conflict: 409 and the exam is left unchanged.
// The lock is on the new room, because that's the room whose bookings could clash.
async function updateExam(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });

  const { error, data } = validateExamBody(req.body ?? {});
  if (error) return res.status(400).json({ error });

  try {
    const existing = await examModel.getExamById(id);
    if (!existing) return res.status(404).json({ error: `Exam ${id} not found` });

    const refError = await checkReferences(data);
    if (refError) return res.status(400).json({ error: refError });

    const outcome = await withRoomLock(data.room, async (conn) => {
      const conflicts = await examModel.findConflictingExams(
        data.examDate, data.startTime, data.endTime, data.room, id, conn
      );
      if (conflicts.length > 0) return { conflicts };
      const matched = await examModel.updateExam(id, data, conn);
      return { matched };
    });

    if (outcome.conflicts) return res.status(409).json(conflictResponse(data, outcome.conflicts));
    // Deleted by someone else between our 404 check and the update.
    if (outcome.matched === 0) return res.status(404).json({ error: `Exam ${id} not found` });

    const exam = await examModel.getExamById(id);
    return res.json(exam);
  } catch (err) {
    if (handleKnownError(err, res)) return;
    console.error('updateExam failed:', err);
    return res.status(500).json({ error: 'Failed to update exam' });
  }
}

// DELETE /api/v1/academic/exams/:id
// Removes an exam, freeing its room slot. 204 on success, 404 if it doesn't exist.
async function deleteExam(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });

  try {
    const deleted = await examModel.deleteExam(id);
    if (deleted === 0) return res.status(404).json({ error: `Exam ${id} not found` });
    return res.status(204).end();
  } catch (err) {
    console.error('deleteExam failed:', err);
    return res.status(500).json({ error: 'Failed to delete exam' });
  }
}

module.exports = {
  createExam,
  listExams,
  getExam,
  updateExam,
  deleteExam,
};
