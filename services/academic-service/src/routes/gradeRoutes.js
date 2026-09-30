const express = require('express');
const gradeController = require('../controllers/gradeController');
const offeringController = require('../controllers/offeringController');

// Router for /api/v1/academic/grades. Paths are relative to the mount point in app.js,
// so '/:id/publish' becomes '/api/v1/academic/grades/:id/publish'.
const router = express.Router();

router.get('/', offeringController.listGrades); // ?courseId=&semesterId=
router.post('/', gradeController.recordGrade);
router.put('/:id/publish', gradeController.publishGrade);

module.exports = router;
