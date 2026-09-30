const express = require('express');
const attendanceController = require('../controllers/attendanceController');

// Router for /api/v1/attendance. Paths are relative to the mount point in app.js,
// so '/session/:sessionId' becomes '/api/v1/attendance/session/:sessionId'.
const router = express.Router();

router.post('/', attendanceController.recordAttendance);
router.get('/session/:sessionId', attendanceController.getSessionAttendance);

module.exports = router;
