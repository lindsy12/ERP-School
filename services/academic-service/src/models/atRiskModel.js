const pool = require('../db');
const attendanceModel = require('./attendanceModel');
const gradeModel = require('./gradeModel');

// Evaluates students against the at-risk rule, and reads/writes the `at_risk_flags` table.
// Like the other models, every function takes an optional `db` argument (defaults to the pool)
// so atRiskCheck can run them all on one locked transaction connection.

// The at-risk rule. This is a specific grading requirement; change it only if the requirement changes.
//
//   A student is AT RISK if EITHER:
//     (a) their overall attendance percentage (from getAttendancePercentageForStudent) is
//         below 75, OR
//     (b) their two most recent published grades, ordered by published_at descending, are
//         BOTH a failing grade ('F').
//
// Edge cases, decided here so they're explicit:
//   - attendance percentage null (no sessions taken yet) -> (a) doesn't apply. No data is not
//     the same as poor attendance.
//   - exactly 75 -> not at risk; the rule says *below* 75.
//   - the percentage counts only 'present'; 'late' is not present (see attendanceModel).
//   - fewer than two published grades -> (b) doesn't apply. Draft grades never count.
//   - two grades published in the same second (published_at has 1-second precision) are
//     tie-broken by grade id, newest first, so the order is always deterministic.
const ATTENDANCE_THRESHOLD = 75;
const FAILING_GRADE = 'F';
const REASON_ATTENDANCE = 'attendance_below_75';
const REASON_FAILS = 'two_consecutive_fails';

// WHAT: runs the rule above for one student, live from the attendance and grades data.
// Returns { isAtRisk, reasons, details }. reasons is [] or contains 'attendance_below_75' and/or
// 'two_consecutive_fails'. details shows the evidence (attendance % and the two most recent
// published grades) so an advisor can see *why* without a second request.
// WHY reuse the existing model functions instead of new SQL: the attendance percentage and the
// grade list already encode the business definitions, such as which sessions count. The flag
// must agree with what the student and advisor see on the attendance and grades endpoints.
async function evaluateStudent(studentId, db = pool) {
  const attendance = await attendanceModel.getAttendancePercentageForStudent(studentId, db);
  const grades = await gradeModel.getGradesForStudent(studentId, db);

  // getGradesForStudent returns drafts too, ordered by semester, so filter and re-sort here.
  const lastTwoPublished = grades
    .filter((g) => g.published)
    .sort((a, b) => b.published_at - a.published_at || b.id - a.id)
    .slice(0, 2);

  const reasons = [];
  if (attendance.percentage !== null && attendance.percentage < ATTENDANCE_THRESHOLD) {
    reasons.push(REASON_ATTENDANCE);
  }
  if (
    lastTwoPublished.length === 2 &&
    lastTwoPublished.every((g) => g.grade_letter === FAILING_GRADE)
  ) {
    reasons.push(REASON_FAILS);
  }

  return {
    isAtRisk: reasons.length > 0,
    reasons,
    details: {
      attendancePercentage: attendance.percentage,
      lastTwoPublishedGrades: lastTwoPublished.map((g) => ({
        gradeId: g.id,
        courseCode: g.course_code,
        semesterName: g.semester_name,
        gradeLetter: g.grade_letter,
        publishedAt: g.published_at,
      })),
    },
  };
}

// Converts a raw at_risk_flags row into clean JSON types: is_at_risk 0/1 becomes a boolean,
// and the comma-joined reason string becomes a `reasons` array.
function toFlag(row) {
  if (!row) return null;
  const { reason, ...rest } = row;
  return { ...rest, is_at_risk: Boolean(row.is_at_risk), reasons: reason ? reason.split(',') : [] };
}

// Makes sure the student has a row in at_risk_flags (inserting a not-at-risk row if missing).
// WHY: atRiskCheck locks the student's row with SELECT ... FOR UPDATE so two checks for the
// same student can't run at once. You can only lock a row that exists; locking a missing
// row takes a "gap lock", which lets two transactions deadlock when both then insert.
// "ON DUPLICATE KEY UPDATE student_id = student_id" is a deliberate no-op when the row
// exists. Unlike INSERT IGNORE, it still reports real errors such as an unknown student id.
async function ensureFlagRow(studentId, db = pool) {
  await db.query(
    `INSERT INTO at_risk_flags (student_id, is_at_risk) VALUES (?, FALSE)
     ON DUPLICATE KEY UPDATE student_id = student_id`,
    [studentId]
  );
}

// Returns the student's current stored flag, or null if they've never been checked.
// Pass { forUpdate: true } inside a transaction to lock the row until commit.
// WHY the lock: atRiskCheck compares old state with new state to decide whether to publish.
// Without the lock, two simultaneous checks could both read "not at risk", both see a
// transition, and send Notifications two identical alerts.
async function getCurrentFlag(studentId, db = pool, { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT id, student_id, is_at_risk, reason, flagged_at, cleared_at
       FROM at_risk_flags WHERE student_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [studentId]
  );
  return toFlag(rows[0]);
}

// Writes the student's new state in one statement, inserting the row if it doesn't exist:
//   - just became at risk (was not at risk, or no row): flagged_at = now, cleared_at = NULL
//   - just stopped being at risk:                       cleared_at = now (flagged_at kept, so
//                                                        the row shows the last at-risk period)
//   - unchanged:                                        both timestamps kept; reason still
//                                                        refreshed (e.g. a second reason appears)
// WHY the transition logic is in SQL: it reads the row's *existing* is_at_risk in the same
// statement that changes it, so it can't act on a stale value.
// ORDER MATTERS: MySQL applies these assignments left to right, and later ones see earlier
// ones' new values. So is_at_risk must be assigned LAST, or the IF()s above it would compare
// against the value just written instead of the previous one.
async function upsertFlag(studentId, isAtRisk, reasons, db = pool) {
  const reason = isAtRisk ? reasons.join(',') : null;
  await db.query(
    `INSERT INTO at_risk_flags (student_id, is_at_risk, reason, flagged_at, cleared_at)
     VALUES (?, ?, ?, IF(?, NOW(), NULL), NULL) AS new
     ON DUPLICATE KEY UPDATE
       flagged_at = IF(new.is_at_risk AND NOT at_risk_flags.is_at_risk,
                       NOW(), at_risk_flags.flagged_at),
       cleared_at = IF(new.is_at_risk,
                       IF(at_risk_flags.is_at_risk, at_risk_flags.cleared_at, NULL),
                       IF(at_risk_flags.is_at_risk, NOW(), at_risk_flags.cleared_at)),
       reason     = new.reason,
       is_at_risk = new.is_at_risk`,
    [studentId, isAtRisk, reason, isAtRisk]
  );
}

// Returns every student currently flagged at risk, with name and email for display, most
// recently flagged first.
// WHY read the stored table instead of evaluating everyone live: the advisor list covers the
// whole school, and re-running the rule for every student on each page load would get slow as
// the school grows. The stored flags are kept current by the automatic checks after each
// attendance batch and grade publish.
async function listAtRiskStudents(db = pool) {
  const [rows] = await db.query(
    `SELECT f.student_id, s.first_name, s.last_name, s.email,
            f.reason, f.flagged_at
       FROM at_risk_flags f
       JOIN students s ON s.id = f.student_id
      WHERE f.is_at_risk = TRUE
      ORDER BY f.flagged_at DESC, f.student_id`
  );
  return rows.map(({ reason, ...rest }) => ({
    ...rest,
    reasons: reason ? reason.split(',') : [],
  }));
}

module.exports = {
  evaluateStudent,
  ensureFlagRow,
  getCurrentFlag,
  upsertFlag,
  listAtRiskStudents,
};
