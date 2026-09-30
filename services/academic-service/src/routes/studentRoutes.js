const express = require('express');
const enrollmentController = require('../controllers/enrollmentController');

// Router for /api/v1/students. Only the nested enrollments list exists for now; student
// CRUD can be added here later. The handler lives in enrollmentController because the data
// it returns is enrollments, just filtered by student.
const router = express.Router();

router.get('/:studentId/enrollments', enrollmentController.listStudentEnrollments);

module.exports = router;
