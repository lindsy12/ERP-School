const pool = require('../db');
const atRiskModel = require('../models/atRiskModel');
const { publishEvent } = require('./rabbitmq');

// WHAT: checkAndFlagStudent(studentId) re-evaluates one student against the at-risk rule
// (see atRiskModel.evaluateStudent), always saves the result to at_risk_flags, and publishes
// "academic.student.at_risk_flagged" ONLY when the student has just moved from not-at-risk
// (or never checked) to at-risk.
//
// WHY only on a transition, not on every check: checks run automatically after every
// attendance batch and every grade publish. A student who is at risk stays at risk across
// many checks, e.g. each new register taken while their attendance is still under 75%.
// Publishing on every check would make Notifications email the same student and advisor over
// and over about something they already know. Comparing with the stored flag means one alert
// per at-risk period. If the student recovers and later becomes at risk again, that's a new
// transition and a new alert.
//
// Leaving at-risk updates the table (cleared_at) but publishes nothing; nobody consumes such
// an event yet.
//
// Concurrency: the whole check runs in one transaction holding a row lock on the student's
// flag (SELECT ... FOR UPDATE). Two simultaneous checks for the same student, e.g. an attendance
// batch and a grade publish landing together, therefore run one after the other. The second
// sees the first's result, finds no transition, and doesn't publish a duplicate. The rule is
// evaluated *after* taking the lock and on the same connection, so the second check also sees
// the latest committed data rather than a stale snapshot. Checks for different students don't
// block each other.
//
// Like publishEvent, this NEVER throws. It's a side effect of saving attendance or publishing a
// grade, and a failure here must not turn those successful writes into a 500. Failures are
// logged, and the next check for that student (or the live GET endpoint) will catch up.
// Returns { isAtRisk, reasons, becameAtRisk }, or null if the check failed.
async function checkAndFlagStudent(studentId) {
  let conn;
  try {
    // Outside the transaction so the row exists to be locked (see atRiskModel.ensureFlagRow).
    await atRiskModel.ensureFlagRow(studentId);

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const previous = await atRiskModel.getCurrentFlag(studentId, conn, { forUpdate: true });
    const { isAtRisk, reasons } = await atRiskModel.evaluateStudent(studentId, conn);
    const becameAtRisk = isAtRisk && !previous?.is_at_risk;

    // Always write, so the table stays current even when nothing transitioned
    // (e.g. the reasons changed while the student stayed at risk).
    await atRiskModel.upsertFlag(studentId, isAtRisk, reasons, conn);
    const current = await atRiskModel.getCurrentFlag(studentId, conn);

    await conn.commit();

    if (previous?.is_at_risk && !isAtRisk) {
      console.log(`[at-risk] student ${studentId} is no longer at risk`);
    }

    // Publish only AFTER commit, so we never announce a flag that was rolled back.
    if (becameAtRisk) {
      console.log(`[at-risk] student ${studentId} flagged at risk: ${reasons.join(', ')}`);
      await publishEvent('academic.student.at_risk_flagged', {
        studentId,
        reasons,
        flaggedAt: current.flagged_at.toISOString(),
      });
    }

    return { isAtRisk, reasons, becameAtRisk };
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    console.error(`[at-risk] check FAILED for student ${studentId}:`, err.message);
    return null;
  } finally {
    // Always give the connection back to the pool.
    if (conn) conn.release();
  }
}

module.exports = {
  checkAndFlagStudent,
};
