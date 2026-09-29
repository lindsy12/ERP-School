const express = require('express');
const gradeController = require('../controllers/gradeController');

// Router for /api/v1/grades. Paths are relative to the mount point in app.js,
// so '/:id/publish' becomes '/api/v1/grades/:id/publish'.
const router = express.Router();

router.post('/', gradeController.recordGrade);
router.put('/:id/publish', gradeController.publishGrade);

module.exports = router;
