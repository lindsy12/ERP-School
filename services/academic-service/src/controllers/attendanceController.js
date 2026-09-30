const attendanceModel = require('../models/attendanceModel');
const courseModel = require('../models/courseModel');
const semesterModel = require('../models/semesterModel');
const studentModel = require('../models/studentModel');
const {
  parseId,
  findMissingFields,
  parseDate,
  parseTime,
  toDateString,
} = require('../utils/validation');
const { checkAndFlagStudent } = require('../services/atRiskCheck');

// Express route handlers for class sessions and attendance.
// Same conventions as the course/enrollment controllers: validate first (400), then check
// referenced rows exist, then write; errors are { error: "message" }.

const ATTENDANCE_STATUSES = ['present', 'absent', 'late'];

// POST /api/v1/sessions
// Creates one class session: { courseId, semesterId, sessionDate: "YYYY-MM-DD",
// startTime: "HH:MM", endTime: "HH:MM" }. Returns 201 with the session.
// Why check the date falls inside the semester: a session outside its semester would still
// count toward that semester's attendance percentages, which would be wrong and hard to spot later.
async function createSession(req, res) {
  const body = req.body ?? {};

  const missing = findMissingFields(body, [
    'courseId',
    'semesterId',
    'sessionDate',
    'startTime',
    'endTime',
  ]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }

  const courseId = parseId(body.courseId);
  const semesterId = parseId(body.semesterId);
  if (courseId === null) return res.status(400).json({ error: 'courseId must be a positive integer' });
  if (semesterId === null) return res.status(400).json({ error: 'semesterId must be a positive integer' });

  const sessionDate = parseDate(body.sessionDate);
  if (sessionDate === null) {
    return res.status(400).json({ error: 'sessionDate must be a valid date in YYYY-MM-DD format' });
  }
  const startTime = parseTime(body.startTime);
  const endTime = parseTime(body.endTime);
  if (startTime === null || endTime === null) {
    return res.status(400).json({ error: 'startTime and endTime must be 24-hour times like "09:00" or "09:00:00"' });
  }
  if (endTime <= startTime) {
    return res.status(400).json({ error: 'endTime must be after startTime' });
  }

  try {
    const [course, semester] = await Promise.all([
      courseModel.getCourseById(courseId),
      semesterModel.getSemesterById(semesterId),
    ]);
    if (!course) return res.status(400).json({ error: `courseId ${courseId} does not exist` });
    if (!semester) return res.status(400).json({ error: `semesterId ${semesterId} does not exist` });

    const semesterStart = toDateString(semester.start_date);
    const semesterEnd = toDateString(semester.end_date);
    // "YYYY-MM-DD" strings sort the same way as the dates they represent.
    if (sessionDate < semesterStart || sessionDate > semesterEnd) {
      return res.status(400).json({
        error: `sessionDate ${sessionDate} is outside ${semester.name} (${semesterStart} to ${semesterEnd})`,
      });
    }

    const id = await attendanceModel.createClassSession(
      courseId,
      semesterId,
      sessionDate,
      startTime,
      endTime
    );
    const session = await attendanceModel.getClassSessionById(id);
    return res.status(201).json(session);
  } catch (err) {
    // UNIQUE (course_id, semester_id, session_date, start_time)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: `A session for course ${courseId} on ${sessionDate} at ${startTime} already exists in this semester`,
      });
    }
    console.error('createSession failed:', err);
    return res.status(500).json({ error: 'Failed to create session' });
  }
}

// POST /api/v1/attendance
// Records attendance for a whole session: { sessionId, records: [{ studentId, status }] }.
// All-or-nothing: if any record is invalid, nothing is saved.
// Checks, in order: body shape (400), session exists (400), every student is enrolled in the
// session's course and semester (400), nobody is already marked for this session (409).
// Returns 201 with the session's full register.
async function recordAttendance(req, res) {
  const body = req.body ?? {};

  const missing = findMissingFields(body, ['sessionId', 'records']);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }
  const sessionId = parseId(body.sessionId);
  if (sessionId === null) return res.status(400).json({ error: 'sessionId must be a positive integer' });

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return res.status(400).json({ error: 'records must be a non-empty array of { studentId, status }' });
  }

  // Validate every record up front and report the first bad one by its position, so the
  // client can find it in a long list.
  const records = [];
  for (const [i, record] of body.records.entries()) {
    const studentId = parseId(record?.studentId);
    if (studentId === null) {
      return res.status(400).json({ error: `records[${i}].studentId must be a positive integer` });
    }
    if (!ATTENDANCE_STATUSES.includes(record.status)) {
      return res.status(400).json({
        error: `records[${i}].status must be one of: ${ATTENDANCE_STATUSES.join(', ')}`,
      });
    }
    records.push({ studentId, status: record.status });
  }

  // The same student twice in one batch is a client mistake. Catch it here instead of letting
  // the UNIQUE key fail and produce a confusing "already recorded" 409.
  const studentIds = records.map((r) => r.studentId);
  const repeated = [...new Set(studentIds.filter((id, i) => studentIds.indexOf(id) !== i))];
  if (repeated.length > 0) {
    return res.status(400).json({ error: `studentId(s) listed more than once: ${repeated.join(', ')}` });
  }

  try {
    const session = await attendanceModel.getClassSessionById(sessionId);
    if (!session) return res.status(400).json({ error: `sessionId ${sessionId} does not exist` });

    // This also catches ids that aren't students at all, since they can't be enrolled.
    const enrolled = await attendanceModel.getEnrolledStudentIds(
      session.course_id,
      session.semester_id,
      studentIds
    );
    const notEnrolled = studentIds.filter((id) => !enrolled.includes(id));
    if (notEnrolled.length > 0) {
      return res.status(400).json({
        error: `studentId(s) not enrolled in this session's course and semester: ${notEnrolled.join(', ')}`,
      });
    }

    // Name who is already marked, so the client knows exactly which records to remove.
    // The UNIQUE key (caught below) is still the real guard if two requests race.
    const existing = await attendanceModel.getAttendanceForSession(sessionId);
    const alreadyMarked = existing
      .map((r) => r.student_id)
      .filter((id) => studentIds.includes(id));
    if (alreadyMarked.length > 0) {
      return res.status(409).json({
        error: `Attendance already recorded for studentId(s) ${alreadyMarked.join(', ')} in session ${sessionId}; nothing was saved`,
      });
    }

    await attendanceModel.recordAttendance(sessionId, records);

    // New attendance changes these students' attendance percentage, so re-check each one's
    // at-risk status. One at a time, on purpose: each check holds a pool connection for its
    // transaction, and running a whole class in parallel could tie up the pool for other
    // requests. checkAndFlagStudent never throws, so the attendance (already saved) still returns 201.
    for (const { studentId } of records) {
      await checkAndFlagStudent(studentId);
    }

    const register = await attendanceModel.getAttendanceForSession(sessionId);
    return res.status(201).json({ session, records: register });
  } catch (err) {
    // UNIQUE (session_id, student_id). The whole batch was rolled back.
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: `Attendance for one or more of these students was already recorded in session ${sessionId}; nothing was saved`,
      });
    }
    console.error('recordAttendance failed:', err);
    return res.status(500).json({ error: 'Failed to record attendance' });
  }
}

// GET /api/v1/attendance/session/:sessionId
// Returns { session, records } for one session. 404 if the session doesn't exist, and an
// empty records array if attendance hasn't been taken yet.
async function getSessionAttendance(req, res) {
  const sessionId = parseId(req.params.sessionId);
  if (sessionId === null) return res.status(400).json({ error: 'sessionId must be a positive integer' });

  try {
    const session = await attendanceModel.getClassSessionById(sessionId);
    if (!session) return res.status(404).json({ error: `Session ${sessionId} not found` });

    const records = await attendanceModel.getAttendanceForSession(sessionId);
    return res.json({ session, records });
  } catch (err) {
    console.error('getSessionAttendance failed:', err);
    return res.status(500).json({ error: 'Failed to get session attendance' });
  }
}

// GET /api/v1/students/:studentId/attendance
// Returns { studentId, summary: { totalSessions, presentSessions, lateSessions, percentage },
// records: [...] }. 404 if the student doesn't exist.
// Why both in one response: the percentage on its own isn't useful without the records behind it.
async function getStudentAttendance(req, res) {
  const studentId = parseId(req.params.studentId);
  if (studentId === null) return res.status(400).json({ error: 'studentId must be a positive integer' });

  try {
    const student = await studentModel.getStudentById(studentId);
    if (!student) return res.status(404).json({ error: `Student ${studentId} not found` });

    const [summary, records] = await Promise.all([
      attendanceModel.getAttendancePercentageForStudent(studentId),
      attendanceModel.getAttendanceForStudent(studentId),
    ]);
    return res.json({ studentId, summary, records });
  } catch (err) {
    console.error('getStudentAttendance failed:', err);
    return res.status(500).json({ error: 'Failed to get student attendance' });
  }
}

module.exports = {
  createSession,
  recordAttendance,
  getSessionAttendance,
  getStudentAttendance,
};
