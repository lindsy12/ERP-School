const express = require('express');
const enrollmentController = require('../controllers/enrollmentController');

// Router for /api/v1/enrollments. Paths here are relative to where app.js mounts the router,
// so '/' becomes '/api/v1/enrollments'. This file only maps URLs to controller handlers.
const router = express.Router();

router.post('/', enrollmentController.createEnrollment);

module.exports = router;
