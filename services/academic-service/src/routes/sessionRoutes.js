const express = require('express');
const attendanceController = require('../controllers/attendanceController');

// Router for /api/v1/sessions (class sessions). Paths are relative to the mount point in app.js.
// The handler lives in attendanceController because sessions exist to take attendance against.
const router = express.Router();

router.post('/', attendanceController.createSession);

module.exports = router;
