const express = require('express');
const offeringController = require('../controllers/offeringController');

// Router for /api/v1/academic/instructors. Courses have no instructor yet, so "my offerings"
// lists every course/semester pair that has enrolled students.
const router = express.Router();

router.get('/me/offerings', offeringController.listMyOfferings);

module.exports = router;
