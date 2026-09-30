const pool = require('../db');
const gradeModel = require('./gradeModel');

// Data access and business rules for `grade_appeals`.
//
// Unlike most models, createAppeal and updateAppealStatus contain business rules (appeal only a
// published grade; allowed status transitions), because the appeal lifecycle is defined here.
// When a rule is broken they throw an AppealError with a machine-readable `code`, and the
// controller maps each code to an HTTP status, so the model stays free of HTTP details.
// Every function takes an optional `db` argument (defaults to the pool) so the controller can
// run a status change and a regrade in one transaction.

// Error type for broken appeal rules. `code` is stable for the controller to switch on;
// `message` is human-readable and safe to return to the client.
class AppealError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppealError';
    this.code = code;
  }
}

const OPEN_STATUSES = ['pending', 'under_review'];

// Allowed moves: pending -> under_review -> resolved_approved | resolved_rejected.
// Resolved states are final, and no status can be skipped (e.g. pending -> resolved_*),
// so every resolution has been through review first.
const TRANSITIONS = {
  pending: ['under_review'],
  under_review: ['resolved_approved', 'resolved_rejected'],
  resolved_approved: [],
  resolved_rejected: [],
};
const STATUSES = Object.keys(TRANSITIONS);

// One SELECT used by both reads, joining in the student, course, semester and the grade's
// CURRENT values (which differ from the original_* snapshot after an approved regrade).
const APPEAL_SELECT = `
  SELECT a.id, a.grade_id, a.student_id, s.first_name, s.last_name,
         g.course_id, c.code AS course_code, c.title AS course_title,
         g.semester_id, sem.name AS semester_name,
         a.original_grade_letter, a.original_grade_points,
         g.grade_letter AS current_grade_letter, g.grade_points AS current_grade_points,
         a.reason, a.status, a.instructor_response, a.created_at, a.resolved_at
    FROM grade_appeals a
    JOIN students s    ON s.id = a.student_id
    JOIN grades g      ON g.id = a.grade_id
    JOIN courses c     ON c.id = g.course_id
    JOIN semesters sem ON sem.id = g.semester_id`;

// DECIMAL columns come back from mysql2 as strings ("3.00"), so convert them to numbers.
function toAppeal(row) {
  if (!row) return null;
  return {
    ...row,
    original_grade_points: Number(row.original_grade_points),
    current_grade_points: Number(row.current_grade_points),
  };
}

// WHAT: files an appeal against a grade and returns the new appeal id.
// Rules (each broken rule throws an AppealError):
//   GRADE_NOT_FOUND     - no such grade
//   STUDENT_MISMATCH    - the grade belongs to a different student (you can only appeal your own)
//   GRADE_NOT_PUBLISHED - drafts can still be corrected directly, so there's nothing to appeal
//   OPEN_APPEAL_EXISTS  - this grade already has a pending or under_review appeal
// WHY check for an open appeal here AND rely on the unique index: the check gives a clear
// message naming the existing appeal, and the index (uq_one_open_appeal_per_grade) is the real
// guarantee if two requests race past the check at the same moment.
async function createAppeal(gradeId, studentId, reason, db = pool) {
  const grade = await gradeModel.getGradeById(gradeId, db);
  if (!grade) throw new AppealError('GRADE_NOT_FOUND', `Grade ${gradeId} not found`);
  if (grade.student_id !== studentId) {
    throw new AppealError('STUDENT_MISMATCH', `Grade ${gradeId} does not belong to student ${studentId}`);
  }
  if (!grade.published) {
    throw new AppealError(
      'GRADE_NOT_PUBLISHED',
      `Grade ${gradeId} is not published yet; only published grades can be appealed`
    );
  }

  const [open] = await db.query(
    `SELECT id, status FROM grade_appeals WHERE grade_id = ? AND status IN (?) LIMIT 1`,
    [gradeId, OPEN_STATUSES]
  );
  if (open.length > 0) {
    throw new AppealError(
      'OPEN_APPEAL_EXISTS',
      `Grade ${gradeId} already has an open appeal (appeal ${open[0].id}, status ${open[0].status})`
    );
  }

  try {
    const [result] = await db.query(
      `INSERT INTO grade_appeals
         (grade_id, student_id, reason, original_grade_letter, original_grade_points)
       VALUES (?, ?, ?, ?, ?)`,
      [gradeId, studentId, reason, grade.grade_letter, grade.grade_points]
    );
    return result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      // Lost a race with another request filing an appeal for the same grade.
      throw new AppealError('OPEN_APPEAL_EXISTS', `Grade ${gradeId} already has an open appeal`);
    }
    throw err;
  }
}

// Returns one appeal with student, course, semester and current grade details, or null.
async function getAppealById(id, db = pool) {
  const [rows] = await db.query(`${APPEAL_SELECT} WHERE a.id = ?`, [id]);
  return toAppeal(rows[0]);
}

// Returns appeals oldest first, i.e. in the order they should be worked through, optionally
// filtered by { status }.
async function listAppeals({ status = null } = {}, db = pool) {
  const where = status ? 'WHERE a.status = ?' : '';
  const [rows] = await db.query(
    `${APPEAL_SELECT} ${where} ORDER BY a.created_at, a.id`,
    status ? [status] : []
  );
  return rows.map(toAppeal);
}

// WHAT: moves an appeal to `newStatus` if the transition is allowed, and returns
// { previousStatus, gradeId }.
//   - resolved_* requires a non-empty instructorResponse (a decision must be explained to the
//     student) and stamps resolved_at.
//   - under_review may include a response (e.g. "looking into it"); if omitted, any existing
//     response is kept.
// Throws AppealError: APPEAL_NOT_FOUND, INVALID_TRANSITION, RESPONSE_REQUIRED.
// WHY lock the row (FOR UPDATE): the caller runs this inside a transaction. The lock makes two
// simultaneous status changes on one appeal run one after the other, so the second sees the
// first's result and is validated against it. Two people can't both resolve the same appeal.
async function updateAppealStatus(id, newStatus, instructorResponse, db = pool) {
  const [rows] = await db.query(
    'SELECT id, grade_id, status FROM grade_appeals WHERE id = ? FOR UPDATE',
    [id]
  );
  const appeal = rows[0];
  if (!appeal) throw new AppealError('APPEAL_NOT_FOUND', `Appeal ${id} not found`);

  const allowed = TRANSITIONS[appeal.status];
  if (!allowed.includes(newStatus)) {
    const next = allowed.length > 0 ? `allowed next: ${allowed.join(', ')}` : 'it is already resolved';
    throw new AppealError(
      'INVALID_TRANSITION',
      `Cannot move appeal ${id} from ${appeal.status} to ${newStatus} (${next})`
    );
  }

  const resolving = newStatus.startsWith('resolved_');
  if (resolving && !instructorResponse) {
    throw new AppealError('RESPONSE_REQUIRED', `instructorResponse is required to move an appeal to ${newStatus}`);
  }

  await db.query(
    `UPDATE grade_appeals
        SET status = ?,
            instructor_response = COALESCE(?, instructor_response),
            resolved_at = IF(?, NOW(), resolved_at)
      WHERE id = ?`,
    [newStatus, instructorResponse ?? null, resolving, id]
  );
  return { previousStatus: appeal.status, gradeId: appeal.grade_id };
}

// Flips a published grade back to draft so the existing gradeModel.recordGrade and
// gradeModel.publishGrade can be reused, unchanged, to apply an approved appeal's new grade.
// WHY it's needed: published grades are frozen on purpose. recordGrade won't overwrite them
// and publishGrade only publishes drafts. An approved appeal is the one sanctioned exception.
// WHY it's safe: the caller runs unpublish -> recordGrade -> publishGrade in ONE transaction
// with the appeal's status change, so no other request ever sees the grade as a draft, and if
// any step fails, everything rolls back, including the appeal staying under_review.
// Returns rows changed: 1 on success, 0 if the grade wasn't published.
// This must never be exposed as its own endpoint.
async function unpublishGradeForRegrade(gradeId, db = pool) {
  const [result] = await db.query(
    'UPDATE grades SET published = FALSE, published_at = NULL WHERE id = ? AND published = TRUE',
    [gradeId]
  );
  return result.affectedRows;
}

module.exports = {
  AppealError,
  STATUSES,
  createAppeal,
  getAppealById,
  listAppeals,
  updateAppealStatus,
  unpublishGradeForRegrade,
};
