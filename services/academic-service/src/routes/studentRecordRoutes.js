const express = require('express');
const attendanceController = require('../controllers/attendanceController');
const gradeController = require('../controllers/gradeController');

// Second router for /api/v1/academic/students: a student's academic record (attendance and grades).
//
// Why a separate file instead of adding to studentRoutes.js: that file belongs to the
// enrollment feature, which is frozen for now. Express lets several routers share one mount
// path. app.js mounts both at /api/v1/academic/students, and a request that doesn't match a route in
// the first router falls through to this one. These routes can be merged into studentRoutes.js
// whenever that file is next edited.
const router = express.Router();

router.get('/:studentId/attendance', attendanceController.getStudentAttendance);
router.get('/:studentId/grades', gradeController.getStudentGrades);

module.exports = router;
