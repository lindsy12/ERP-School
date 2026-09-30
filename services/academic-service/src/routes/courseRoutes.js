const express = require('express');
const courseController = require('../controllers/courseController');
const offeringController = require('../controllers/offeringController');

// Router for /api/v1/academic/courses. Paths here are relative to where app.js mounts the router,
// so '/:id' becomes '/api/v1/academic/courses/:id'. This file only maps URLs to controller handlers.
const router = express.Router();

router.post('/', courseController.createCourse);
router.get('/', courseController.listCourses);
router.get('/:id', courseController.getCourse);
router.get('/:courseId/roster', offeringController.getRoster); // ?semesterId=
router.put('/:id', courseController.updateCourse);
router.delete('/:id', courseController.deleteCourse);

module.exports = router;
