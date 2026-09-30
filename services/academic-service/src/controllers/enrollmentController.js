const enrollmentModel = require('../models/enrollmentModel');
const studentModel = require('../models/studentModel');
const semesterModel = require('../models/semesterModel');
const courseModel = require('../models/courseModel');
const { publishEvent } = require('../services/rabbitmq');

// Express route handlers for enrollments.
// Error responses use the same { error: "message" } shape as the course/program endpoints.

// Parses a value into a positive integer id, or returns null if it isn't one.
// Why: ids can arrive as strings ("5") or junk ("abc", -1, 2.5); reject them with a 400
// before they reach MySQL. (Same helper as courseController, kept local so that file
// stays untouched.)
function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Reads the flat tuition rate from the TUITION_AMOUNT env var, or returns null if it's
// missing or invalid.
// Why a flat env var: tuition is per-course eventually, but Finance needs *some* amount in the
// event to create an invoice today. Why fail if it's missing: publishing a null or NaN amount
// would make Finance create a broken invoice, so it's better to refuse the enrollment loudly.
function getTuitionAmount() {
  const raw = process.env.TUITION_AMOUNT;
  if (raw === undefined || raw.trim() === '') return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

// POST /api/v1/academic/enrollments
// Enrolls a student in a course for a semester. Steps, in order:
//   1. validate the body (400)
//   2. confirm the student, course and semester exist (400)
//   3. enforce prerequisites (409, listing what's missing)
//   4. insert; the UNIQUE key rejects a double enrollment (409)
//   5. publish "academic.student.enrolled" so Finance can invoice and Notifications can notify
// The event is published only AFTER the row is saved, so we never announce an enrollment
// that doesn't exist. If publishing fails, the enrollment still stands (see services/rabbitmq.js).
async function createEnrollment(req, res) {
  // Express 5 leaves req.body undefined when the request has no JSON body.
  const body = req.body ?? {};

  const missing = ['studentId', 'courseId', 'semesterId'].filter(
    (field) => body[field] === undefined || body[field] === null || body[field] === ''
  );
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }

  const studentId = parseId(body.studentId);
  const courseId = parseId(body.courseId);
  const semesterId = parseId(body.semesterId);
  const invalid = [
    ['studentId', studentId],
    ['courseId', courseId],
    ['semesterId', semesterId],
  ]
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  if (invalid.length > 0) {
    return res.status(400).json({ error: `${invalid.join(', ')} must be positive integer(s)` });
  }

  // Check config before touching the DB, so a misconfigured server never saves an
  // enrollment it can't bill for.
  const tuitionAmount = getTuitionAmount();
  if (tuitionAmount === null) {
    console.error('createEnrollment: TUITION_AMOUNT env var is missing or not a valid number');
    return res.status(500).json({ error: 'Server misconfiguration: tuition amount is not set' });
  }

  try {
    // The three lookups don't depend on each other, so run them in parallel.
    const [student, course, semester] = await Promise.all([
      studentModel.getStudentById(studentId),
      courseModel.getCourseById(courseId),
      semesterModel.getSemesterById(semesterId),
    ]);
    if (!student) return res.status(400).json({ error: `studentId ${studentId} does not exist` });
    if (!course) return res.status(400).json({ error: `courseId ${courseId} does not exist` });
    if (!semester) return res.status(400).json({ error: `semesterId ${semesterId} does not exist` });

    const missingPrereqs = await enrollmentModel.getMissingPrerequisites(
      studentId,
      courseId,
      semesterId
    );
    if (missingPrereqs.length > 0) {
      const list = missingPrereqs.map((c) => `${c.code} (${c.title})`).join(', ');
      return res.status(409).json({
        error: `Prerequisites not met for ${course.code}. Missing: ${list}`,
        missingPrerequisites: missingPrereqs,
      });
    }

    const id = await enrollmentModel.createEnrollment({ studentId, courseId, semesterId });
    const enrollment = await enrollmentModel.getEnrollmentById(id);

    // publishEvent never throws; on failure it logs clearly and returns false.
    // We await it only so the log lines come out in order. The response is 201 either way.
    await publishEvent('academic.student.enrolled', {
      studentId,
      courseId,
      semesterId,
      enrolledAt: enrollment.enrolled_at.toISOString(),
      tuitionAmount,
    });

    return res.status(201).json(enrollment);
  } catch (err) {
    // UNIQUE (student_id, course_id, semester_id): already enrolled in this course this semester.
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: `Student ${studentId} is already enrolled in course ${courseId} for semester ${semesterId}`,
      });
    }
    console.error('createEnrollment failed:', err);
    return res.status(500).json({ error: 'Failed to create enrollment' });
  }
}

// GET /api/v1/academic/students/:studentId/enrollments
// Lists all of a student's enrollments (including dropped) with course and semester names.
// Returns 404 if the student doesn't exist, and 200 with [] if they exist but have no enrollments.
async function listStudentEnrollments(req, res) {
  const studentId = parseId(req.params.studentId);
  if (studentId === null) {
    return res.status(400).json({ error: 'studentId must be a positive integer' });
  }

  try {
    const student = await studentModel.getStudentById(studentId);
    if (!student) return res.status(404).json({ error: `Student ${studentId} not found` });

    const enrollments = await enrollmentModel.listEnrollmentsForStudent(studentId);
    return res.json(enrollments);
  } catch (err) {
    console.error('listStudentEnrollments failed:', err);
    return res.status(500).json({ error: 'Failed to list enrollments' });
  }
}

module.exports = {
  createEnrollment,
  listStudentEnrollments,
};

