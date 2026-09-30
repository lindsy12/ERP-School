const offeringModel = require('../models/offeringModel');
const { parseId, toDateString } = require('../utils/validation');

// Express route handlers for the instructor pages: offerings, rosters, and an offering's
// sessions and grades. Dates go out as "YYYY-MM-DD" (see toDateString for why).

const dateOrValue = (value) => (value instanceof Date ? toDateString(value) : value);

// Reads the course id (path or ?courseId=) and ?semesterId=; answers 400 and returns null if invalid.
function parseOffering(req, res) {
  const courseId = parseId(req.params.courseId ?? req.query.courseId);
  const semesterId = parseId(req.query.semesterId);
  if (courseId === null) {
    res.status(400).json({ error: 'courseId must be a positive integer' });
    return null;
  }
  if (semesterId === null) {
    res.status(400).json({ error: 'semesterId must be a positive integer' });
    return null;
  }
  return { courseId, semesterId };
}

async function listMyOfferings(req, res) {
  try {
    const rows = await offeringModel.listOfferings();
    return res.json(rows.map((o) => ({
      ...o,
      enrolled_count: Number(o.enrolled_count),
      semester_start: dateOrValue(o.semester_start),
      semester_end: dateOrValue(o.semester_end),
    })));
  } catch (err) {
    console.error('listMyOfferings failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getRoster(req, res) {
  const offering = parseOffering(req, res);
  if (!offering) return undefined;
  try {
    return res.json(await offeringModel.getRoster(offering.courseId, offering.semesterId));
  } catch (err) {
    console.error('getRoster failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function listSessions(req, res) {
  const offering = parseOffering(req, res);
  if (!offering) return undefined;
  try {
    const rows = await offeringModel.listSessions(offering.courseId, offering.semesterId);
    return res.json(rows.map((s) => ({
      ...s,
      session_date: dateOrValue(s.session_date),
      attendance_count: Number(s.attendance_count),
    })));
  } catch (err) {
    console.error('listSessions failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function listGrades(req, res) {
  const offering = parseOffering(req, res);
  if (!offering) return undefined;
  try {
    return res.json(await offeringModel.listGrades(offering.courseId, offering.semesterId));
  } catch (err) {
    console.error('listGrades failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  listMyOfferings,
  getRoster,
  listSessions,
  listGrades,
};
