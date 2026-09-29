const express = require('express');
const examController = require('../controllers/examController');

// Router for /api/v1/exams. Paths are relative to the mount point in app.js,
// so '/:id' becomes '/api/v1/exams/:id'. Filters for the list are query params
// (?semesterId=&courseId=), handled in the controller.
const router = express.Router();

router.post('/', examController.createExam);
router.get('/', examController.listExams);
router.get('/:id', examController.getExam);
router.put('/:id', examController.updateExam);
router.delete('/:id', examController.deleteExam);

module.exports = router;
