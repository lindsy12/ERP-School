const express = require('express');
const attendanceController = require('../controllers/attendanceController');
const offeringController = require('../controllers/offeringController');

// Router for /api/v1/academic/sessions (class sessions). Paths are relative to the mount point in app.js.
// The handler lives in attendanceController because sessions exist to take attendance against.
const router = express.Router();

router.get('/', offeringController.listSessions); // ?courseId=&semesterId=
router.post('/', attendanceController.createSession);

module.exports = router;
