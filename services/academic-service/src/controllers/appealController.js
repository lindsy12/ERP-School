const pool = require('../db');
const appealModel = require('../models/appealModel');
const gradeModel = require('../models/gradeModel');
const { publishEvent } = require('../services/rabbitmq');
const { checkAndFlagStudent } = require('../services/atRiskCheck');
const { parseId, findMissingFields } = require('../utils/validation');

// Express route handlers for grade appeals.
// Business rules live in appealModel, which throws AppealError. appealErrorStatus maps
// each error code to the right HTTP status.

const REASON_MAX_LENGTH = 2000;
// Same grade rules as gradeController (which doesn't export them, and is frozen).
// Keep these two in sync.
const GRADE_LETTERS = ['A', 'B', 'C', 'D', 'F'];

// Maps AppealError codes to HTTP statuses.
// Why 400 for GRADE_NOT_PUBLISHED and INVALID_TRANSITION: the request itself asks for
// something the rules don't allow. Why 409 for OPEN_APPEAL_EXISTS: the request is fine, but
// it clashes with existing data.
const APPEAL_ERROR_STATUS = {
  GRADE_NOT_FOUND: 404,
  APPEAL_NOT_FOUND: 404,
  STUDENT_MISMATCH: 400,
  GRADE_NOT_PUBLISHED: 400,
  INVALID_TRANSITION: 400,
  RESPONSE_REQUIRED: 400,
  OPEN_APPEAL_EXISTS: 409,
};

// Sends the response for an AppealError. Returns true if it was one, false otherwise.
function handleAppealError(err, res) {
  if (!(err instanceof appealModel.AppealError)) return false;
  res.status(APPEAL_ERROR_STATUS[err.code] ?? 400).json({ error: err.message, code: err.code });
  return true;
}

// Validates the optional regrade fields on an approval.
// Returns { error } or { regrade: null | { gradeLetter, gradePoints } }.
// Both fields must come together, and only with resolved_approved: a rejected appeal (or a
// move to review) that carried a new grade would be a contradiction, so reject it rather than
// silently ignoring half the request.
function parseRegrade(body, status) {
  const hasLetter = body.newGradeLetter !== undefined && body.newGradeLetter !== null;
  const hasPoints = body.newGradePoints !== undefined && body.newGradePoints !== null;
  if (!hasLetter && !hasPoints) return { regrade: null };
  if (hasLetter !== hasPoints) {
    return { error: 'newGradeLetter and newGradePoints must be provided together' };
  }
  if (status !== 'resolved_approved') {
    return { error: 'newGradeLetter/newGradePoints are only allowed when status is resolved_approved' };
  }

  const gradeLetter = typeof body.newGradeLetter === 'string' ? body.newGradeLetter.trim().toUpperCase() : null;
  if (!GRADE_LETTERS.includes(gradeLetter)) {
    return { error: `newGradeLetter must be one of: ${GRADE_LETTERS.join(', ')}` };
  }
  const gradePoints = body.newGradePoints;
  if (
    typeof gradePoints !== 'number' ||
    !Number.isFinite(gradePoints) ||
    gradePoints < 0 ||
    gradePoints > 4 ||
    Math.round(gradePoints * 100) !== gradePoints * 100
  ) {
    return { error: 'newGradePoints must be a number from 0 to 4 with at most 2 decimal places' };
  }
  return { regrade: { gradeLetter, gradePoints } };
}

// POST /api/v1/academic/grades/:gradeId/appeals
// Body: { studentId, reason }. Files an appeal and returns 201 with it.
// 400 missing/invalid input, grade not published, or grade belongs to another student;
// 404 grade not found; 409 an open appeal already exists for this grade.
async function createAppeal(req, res) {
  const gradeId = parseId(req.params.gradeId);
  if (gradeId === null) return res.status(400).json({ error: 'gradeId must be a positive integer' });

  const body = req.body ?? {};
  const missing = findMissingFields(body, ['studentId', 'reason']);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }
  const studentId = parseId(body.studentId);
  if (studentId === null) return res.status(400).json({ error: 'studentId must be a positive integer' });
  if (typeof body.reason !== 'string' || body.reason.trim() === '') {
    return res.status(400).json({ error: 'reason must be a non-empty string' });
  }
  const reason = body.reason.trim();
  if (reason.length > REASON_MAX_LENGTH) {
    return res.status(400).json({ error: `reason must be at most ${REASON_MAX_LENGTH} characters` });
  }

  try {
    const id = await appealModel.createAppeal(gradeId, studentId, reason);
    const appeal = await appealModel.getAppealById(id);
    return res.status(201).json(appeal);
  } catch (err) {
    if (handleAppealError(err, res)) return;
    console.error('createAppeal failed:', err);
    return res.status(500).json({ error: 'Failed to create appeal' });
  }
}

// GET /api/v1/academic/appeals?status=
// Lists appeals oldest first (the order to work through them). An unknown status is a 400,
// not an empty list, so a typo like ?status=pendng doesn't look like "no appeals".
async function listAppeals(req, res) {
  const { status } = req.query;
  if (status !== undefined && !appealModel.STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${appealModel.STATUSES.join(', ')}` });
  }

  try {
    const appeals = await appealModel.listAppeals({ status: status ?? null });
    return res.json(appeals);
  } catch (err) {
    console.error('listAppeals failed:', err);
    return res.status(500).json({ error: 'Failed to list appeals' });
  }
}

// GET /api/v1/academic/appeals/:id
async function getAppeal(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });

  try {
    const appeal = await appealModel.getAppealById(id);
    if (!appeal) return res.status(404).json({ error: `Appeal ${id} not found` });
    return res.json(appeal);
  } catch (err) {
    console.error('getAppeal failed:', err);
    return res.status(500).json({ error: 'Failed to get appeal' });
  }
}

// PUT /api/v1/academic/appeals/:id/status
// Body: { status, instructorResponse?, newGradeLetter?, newGradePoints? }.
// Moves the appeal along pending -> under_review -> resolved_approved | resolved_rejected,
// returning 200 with the updated appeal. Invalid jumps are 400.
//
// Approving with a new grade: the status change and the regrade happen in ONE transaction,
// so an appeal is never marked approved without its grade changing, or the other way round.
// The regrade reuses the existing gradeModel functions unchanged:
//   appealModel.unpublishGradeForRegrade -> gradeModel.recordGrade -> gradeModel.publishGrade
// (see unpublishGradeForRegrade for why the first step is needed). After commit, it runs the
// same steps as gradeController's publish: send academic.grade.published, then re-check the
// student's at-risk status. The changed grade reaches Notifications and can move the flag.
async function updateAppealStatus(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });

  const body = req.body ?? {};
  if (!appealModel.STATUSES.includes(body.status)) {
    return res.status(400).json({ error: `status must be one of: ${appealModel.STATUSES.join(', ')}` });
  }
  if (
    body.instructorResponse !== undefined &&
    body.instructorResponse !== null &&
    typeof body.instructorResponse !== 'string'
  ) {
    return res.status(400).json({ error: 'instructorResponse must be a string if provided' });
  }
  // A whitespace-only response counts as missing (the model requires one to resolve).
  const instructorResponse = body.instructorResponse?.trim() || null;

  const { error, regrade } = parseRegrade(body, body.status);
  if (error) return res.status(400).json({ error });

  let conn;
  let regradedGradeId = null;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { gradeId } = await appealModel.updateAppealStatus(id, body.status, instructorResponse, conn);

    if (regrade) {
      const grade = await gradeModel.getGradeById(gradeId, conn);
      const unpublished = await appealModel.unpublishGradeForRegrade(gradeId, conn);
      if (unpublished !== 1) throw new Error(`Grade ${gradeId} was not published; cannot regrade`);
      await gradeModel.recordGrade(
        grade.student_id, grade.course_id, grade.semester_id,
        regrade.gradeLetter, regrade.gradePoints, conn
      );
      const published = await gradeModel.publishGrade(gradeId, conn);
      if (published !== 1) throw new Error(`Grade ${gradeId} could not be re-published`);
      regradedGradeId = gradeId;
    }

    await conn.commit();
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    if (handleAppealError(err, res)) return;
    console.error('updateAppealStatus failed:', err);
    return res.status(500).json({ error: 'Failed to update appeal status' });
  } finally {
    if (conn) conn.release();
  }

  try {
    // Only after commit, so we never announce a grade change that was rolled back.
    // Both calls never throw.
    if (regradedGradeId !== null) {
      const grade = await gradeModel.getGradeById(regradedGradeId);
      await publishEvent('academic.grade.published', {
        studentId: grade.student_id,
        courseId: grade.course_id,
        semesterId: grade.semester_id,
        gradeLetter: grade.grade_letter,
        publishedAt: grade.published_at.toISOString(),
      });
      await checkAndFlagStudent(grade.student_id);
    }

    const appeal = await appealModel.getAppealById(id);
    return res.json(appeal);
  } catch (err) {
    // The change is already committed, so report it as saved but unreadable, rather than
    // letting the client think it failed and retry an invalid transition.
    console.error('updateAppealStatus: saved, but reading it back failed:', err);
    return res.status(500).json({ error: 'Appeal updated, but the result could not be loaded; GET it to confirm' });
  }
}

module.exports = {
  createAppeal,
  listAppeals,
  getAppeal,
  updateAppealStatus,
};
