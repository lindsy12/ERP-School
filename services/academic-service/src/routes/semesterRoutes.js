const express = require('express');
const semesterController = require('../controllers/semesterController');

// Router for /api/v1/academic/semesters.
const router = express.Router();

router.get('/', semesterController.listSemesters);
router.post('/', semesterController.createSemester);

module.exports = router;
