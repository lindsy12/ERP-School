const express = require('express');
const transcriptController = require('../controllers/transcriptController');

// Router for transcript downloads, mounted at /api/v1/academic in app.js with the full path, following
// atRiskRoutes. This avoids adding a third router on /api/v1/academic/students.
// It's its own file rather than sharing appealRoutes because transcripts and appeals are
// unrelated features.
const router = express.Router();

router.get('/students/:studentId/transcript/pdf', transcriptController.downloadTranscript);

module.exports = router;
