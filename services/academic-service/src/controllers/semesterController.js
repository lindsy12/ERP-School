const semesterModel = require('../models/semesterModel');
const { findMissingFields, parseDate, toDateString } = require('../utils/validation');

// Express route handlers for /api/v1/academic/semesters.

const view = (s) => ({ ...s, start_date: toDateString(s.start_date), end_date: toDateString(s.end_date) });

async function listSemesters(req, res) {
  try {
    const rows = await semesterModel.listSemesters();
    return res.json(rows.map(view));
  } catch (err) {
    console.error('listSemesters failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createSemester(req, res) {
  const missing = findMissingFields(req.body, ['name', 'startDate', 'endDate']);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }
  const name = String(req.body.name).trim();
  const startDate = parseDate(req.body.startDate);
  const endDate = parseDate(req.body.endDate);
  if (!name || name.length > 50) return res.status(400).json({ error: 'name must be 1 to 50 characters' });
  if (startDate === null || endDate === null) {
    return res.status(400).json({ error: 'startDate and endDate must be valid dates in YYYY-MM-DD format' });
  }
  if (endDate < startDate) return res.status(400).json({ error: 'endDate must not be before startDate' });

  try {
    const semester = await semesterModel.createSemester({ name, startDate, endDate });
    return res.status(201).json(view(semester));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `A semester named "${name}" already exists` });
    }
    console.error('createSemester failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  listSemesters,
  createSemester,
};
