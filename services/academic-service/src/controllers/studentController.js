const studentModel = require('../models/studentModel');
const { findMissingFields } = require('../utils/validation');

// Express route handlers for listing and creating students (/api/v1/academic/students).

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/v1/academic/students/me: the calling student's own record (found by middleware/identity.js).
async function getMe(req, res) {
  return res.json({ ...req.student, matric_number: `STU${String(req.student.id).padStart(6, '0')}` });
}

async function listStudents(req, res) {
  try {
    return res.json(await studentModel.listStudents());
  } catch (err) {
    console.error('listStudents failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createStudent(req, res) {
  const missing = findMissingFields(req.body, ['firstName', 'lastName', 'email']);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }
  const firstName = String(req.body.firstName).trim();
  const lastName = String(req.body.lastName).trim();
  const email = String(req.body.email).trim().toLowerCase();
  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    return res.status(400).json({ error: 'firstName and lastName must be 1 to 100 characters' });
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 255) {
    return res.status(400).json({ error: 'email must be a valid email address' });
  }

  try {
    return res.status(201).json(await studentModel.createStudent({ firstName, lastName, email }));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `A student with email ${email} already exists` });
    }
    console.error('createStudent failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getMe,
  listStudents,
  createStudent,
};
