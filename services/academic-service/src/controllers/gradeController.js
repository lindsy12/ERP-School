const gradeModel = require('../models/gradeModel');
const attendanceModel = require('../models/attendanceModel');
const courseModel = require('../models/courseModel');
const semesterModel = require('../models/semesterModel');
const studentModel = require('../models/studentModel');
const { publishEvent } = require('../services/rabbitmq');
const { checkAndFlagStudent } = require('../services/atRiskCheck');
const { parseId, findMissingFields } = require('../utils/validation');

// Express route handlers for grades.
// Lifecycle: a grade is recorded as a draft, can be corrected while it's a draft, and is then
// published. Publishing freezes it and fires academic.grade.published.

const GRADE_LETTERS = ['A', 'B', 'C', 'D', 'F'];

// POST /api/v1/academic/grades
// Records or corrects a draft grade:
// { studentId, courseId, semesterId, gradeLetter: "A"-"F", gradePoints: 0-4 }.
// Returns 201 when a new grade is created, and 200 when an existing draft is corrected.
// Returns 409 if the grade is already published: published grades can't change silently.
// Returns 400 if the student isn't actively enrolled in that course that semester.
async function recordGrade(req, res) {
  const body = req.body ?? {};

  const missing = findMissingFields(body, [
    'studentId',
    'courseId',
    'semesterId',
    'gradeLetter',
    'gradePoints',
  ]);
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

  // Accept "a" as well as "A", then store the canonical upper-case letter.
  const gradeLetter = typeof body.gradeLetter === 'string' ? body.gradeLetter.trim().toUpperCase() : null;
  if (!GRADE_LETTERS.includes(gradeLetter)) {
    return res.status(400).json({ error: `gradeLetter must be one of: ${GRADE_LETTERS.join(', ')}` });
  }

  // Must be a number, not a string, between 0 and 4 with at most 2 decimals, matching
  // DECIMAL(3,2) and the 0.00-4.00 CHECK. Rejecting 3.456 is better than MySQL quietly
  // rounding it to 3.46.
  const gradePoints = body.gradePoints;
  if (
    typeof gradePoints !== 'number' ||
    !Number.isFinite(gradePoints) ||
    gradePoints < 0 ||
    gradePoints > 4 ||
    Math.round(gradePoints * 100) !== gradePoints * 100
  ) {
    return res.status(400).json({ error: 'gradePoints must be a number from 0 to 4 with at most 2 decimal places' });
  }

  try {
    const [student, course, semester] = await Promise.all([
      studentModel.getStudentById(studentId),
      courseModel.getCourseById(courseId),
      semesterModel.getSemesterById(semesterId),
    ]);
    if (!student) return res.status(400).json({ error: `studentId ${studentId} does not exist` });
    if (!course) return res.status(400).json({ error: `courseId ${courseId} does not exist` });
    if (!semester) return res.status(400).json({ error: `semesterId ${semesterId} does not exist` });

    const enrolled = await attendanceModel.getEnrolledStudentIds(courseId, semesterId, [studentId]);
    if (enrolled.length === 0) {
      return res.status(400).json({
        error: `Student ${studentId} is not enrolled in course ${courseId} for semester ${semesterId}`,
      });
    }

    const existing = await gradeModel.getGradeByKey(studentId, courseId, semesterId);
    if (existing?.published) {
      return res.status(409).json({
        error: `Grade ${existing.id} for this student, course and semester is already published and can't be changed`,
      });
    }

    await gradeModel.recordGrade(studentId, courseId, semesterId, gradeLetter, gradePoints);
    const grade = await gradeModel.getGradeByKey(studentId, courseId, semesterId);

    // Rare race: someone published this grade between our check above and the upsert.
    // The upsert's IF(published, ...) guard kept the published values, so report the conflict.
    if (grade.published) {
      return res.status(409).json({
        error: `Grade ${grade.id} was published while this request was being processed; it was not changed`,
      });
    }

    return res.status(existing ? 200 : 201).json(grade);
  } catch (err) {
    // ER_DUP_ENTRY can't normally happen because the upsert handles the UNIQUE key,
    // but it's kept for consistency with the other controllers.
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A grade for this student, course and semester already exists' });
    }
    console.error('recordGrade failed:', err);
    return res.status(500).json({ error: 'Failed to record grade' });
  }
}

// PUT /api/v1/academic/grades/:id/publish
// Publishes one grade and fires "academic.grade.published" (consumed by Notifications).
// Returns 200 with the grade and 404 if it doesn't exist.
// Idempotent, as PUT should be: publishing an already-published grade returns 200 with the grade
// unchanged and does NOT fire the event again. The conditional UPDATE in the model guarantees
// exactly one event per grade, even if two publish requests arrive together.
async function publishGrade(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });

  try {
    const before = await gradeModel.getGradeById(id);
    if (!before) return res.status(404).json({ error: `Grade ${id} not found` });

    const changed = await gradeModel.publishGrade(id);
    const grade = await gradeModel.getGradeById(id);

    if (changed === 1) {
      // Only published after the DB change is saved. publishEvent never throws; if RabbitMQ is
      // down it logs the missed event and the grade stays published.
      await publishEvent('academic.grade.published', {
        studentId: grade.student_id,
        courseId: grade.course_id,
        semesterId: grade.semester_id,
        gradeLetter: grade.grade_letter,
        publishedAt: grade.published_at.toISOString(),
      });

      // A newly published grade can change the at-risk rule's "two most recent grades" part.
      // Runs only when this call actually published (not on an idempotent re-publish), and
      // never throws.
      await checkAndFlagStudent(grade.student_id);
    }

    return res.json(grade);
  } catch (err) {
    console.error('publishGrade failed:', err);
    return res.status(500).json({ error: 'Failed to publish grade' });
  }
}

// GET /api/v1/academic/students/:studentId/grades
// Returns { studentId, gpa, totalCredits, grades: [...] }.
// gpa and totalCredits cover PUBLISHED grades only (see gradeModel.getGPA for the formula).
// grades lists drafts too, each with a `published` flag.
// 404 if the student doesn't exist; gpa is null if nothing has been published yet.
async function getStudentGrades(req, res) {
  const studentId = parseId(req.params.studentId);
  if (studentId === null) return res.status(400).json({ error: 'studentId must be a positive integer' });

  try {
    const student = await studentModel.getStudentById(studentId);
    if (!student) return res.status(404).json({ error: `Student ${studentId} not found` });

    const [{ gpa, totalCredits }, grades] = await Promise.all([
      gradeModel.getGPA(studentId),
      gradeModel.getGradesForStudent(studentId),
    ]);
    return res.json({ studentId, gpa, totalCredits, grades });
  } catch (err) {
    console.error('getStudentGrades failed:', err);
    return res.status(500).json({ error: 'Failed to get student grades' });
  }
}

module.exports = {
  recordGrade,
  publishGrade,
  getStudentGrades,
};
