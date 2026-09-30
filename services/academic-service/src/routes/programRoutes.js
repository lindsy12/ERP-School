const express = require('express');
const programController = require('../controllers/programController');

// Router for /api/v1/academic/programs. Paths here are relative to where app.js mounts the router,
// so '/' becomes '/api/v1/academic/programs'. This file only maps URLs to controller handlers.
const router = express.Router();

router.post('/', programController.createProgram);
router.get('/', programController.listPrograms);

module.exports = router;
