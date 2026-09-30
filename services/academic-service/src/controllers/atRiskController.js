const atRiskModel = require('../models/atRiskModel');
const studentModel = require('../models/studentModel');
const { parseId } = require('../utils/validation');

// Express route handlers for at-risk status.
// Both endpoints are read-only. Stored flags are written only by services/atRiskCheck.js,
// which runs automatically after attendance is recorded and grades are published.

// GET /api/v1/academic/students/:studentId/at-risk
// Returns the student's at-risk status evaluated LIVE from current attendance and grades:
//   { studentId, isAtRisk, reasons, details: { attendancePercentage, lastTwoPublishedGrades },
//     storedFlag }
// WHY live: this answer is always correct, even if an automatic check was missed (e.g. the
// DB hiccupped during one) or the data was changed by hand. storedFlag is the last state the
// automatic checks recorded (null if never checked); if it disagrees with isAtRisk, a check
// was missed.
// WHY it doesn't fix the stored flag or publish an event: GET requests must not have side
// effects. Clients, proxies and browsers are free to repeat them, so a GET must never trigger
// notifications.
async function getStudentAtRisk(req, res) {
  const studentId = parseId(req.params.studentId);
  if (studentId === null) return res.status(400).json({ error: 'studentId must be a positive integer' });

  try {
    const student = await studentModel.getStudentById(studentId);
    if (!student) return res.status(404).json({ error: `Student ${studentId} not found` });

    const [evaluation, storedFlag] = await Promise.all([
      atRiskModel.evaluateStudent(studentId),
      atRiskModel.getCurrentFlag(studentId),
    ]);
    return res.json({ studentId, ...evaluation, storedFlag });
  } catch (err) {
    console.error('getStudentAtRisk failed:', err);
    return res.status(500).json({ error: 'Failed to evaluate at-risk status' });
  }
}

// GET /api/v1/academic/at-risk-students
// Returns every student currently flagged at risk (from the stored flags), most recently
// flagged first, for advisors. 200 with [] if nobody is at risk.
async function listAtRiskStudents(req, res) {
  try {
    const students = await atRiskModel.listAtRiskStudents();
    return res.json(students);
  } catch (err) {
    console.error('listAtRiskStudents failed:', err);
    return res.status(500).json({ error: 'Failed to list at-risk students' });
  }
}

module.exports = {
  getStudentAtRisk,
  listAtRiskStudents,
};
