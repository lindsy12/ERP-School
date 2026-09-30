const express = require('express');
const enrollmentController = require('../controllers/enrollmentController');
const studentController = require('../controllers/studentController');

// Router for /api/v1/academic/students: list and create students, plus each student's
// enrollments. The enrollments handler lives in enrollmentController because the data
// it returns is enrollments, just filtered by student.
const router = express.Router();

router.get('/me', studentController.getMe);
router.get('/', studentController.listStudents);
router.post('/', studentController.createStudent);
router.get('/:studentId/enrollments', enrollmentController.listStudentEnrollments);

module.exports = router;
