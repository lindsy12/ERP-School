const express = require('express');
const atRiskController = require('../controllers/atRiskController');

// Router for the at-risk endpoints, mounted at /api/v1 in app.js.
// WHY mount at /api/v1 instead of /api/v1/students: one endpoint is per-student and the
// other is a top-level list, so this router holds full paths for both. It also avoids adding
// a third router on /api/v1/students. Requests that don't match these paths pass through
// untouched.
const router = express.Router();

router.get('/students/:studentId/at-risk', atRiskController.getStudentAtRisk);
router.get('/at-risk-students', atRiskController.listAtRiskStudents);

module.exports = router;
