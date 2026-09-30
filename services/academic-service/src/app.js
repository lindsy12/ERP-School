require('dotenv').config();
const path = require('path');
const express = require('express');
const pool = require('./db');
const { identify, staffWritesOnly } = require('./middleware/identity');
const programRoutes = require('./routes/programRoutes');
const courseRoutes = require('./routes/courseRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const studentRoutes = require('./routes/studentRoutes');
const studentRecordRoutes = require('./routes/studentRecordRoutes');
const semesterRoutes = require('./routes/semesterRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const gradeRoutes = require('./routes/gradeRoutes');
const atRiskRoutes = require('./routes/atRiskRoutes');
const examRoutes = require('./routes/examRoutes');
const appealRoutes = require('./routes/appealRoutes');
const transcriptRoutes = require('./routes/transcriptRoutes');
const instructorRoutes = require('./routes/instructorRoutes');

// Builds the app without starting it (src/server.js listens), so tests can use it directly.
const app = express();
app.disable('x-powered-by');
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'academic-service', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', service: 'academic-service', db: 'not connected' });
  }
});

// Academic web pages (client/). The gateway forwards GET /academic/* here without a token check,
// so only static files may live under this path.
app.use('/academic', express.static(path.join(__dirname, '..', 'client')));

// Every API route lives under /api/v1/academic: the gateway forwards that prefix here unchanged.
const api = express.Router();
api.use(identify, staffWritesOnly);
api.use('/programs', programRoutes);
api.use('/courses', courseRoutes);
api.use('/enrollments', enrollmentRoutes);
api.use('/students', studentRoutes);
// Second router on the same path: requests that studentRoutes doesn't match fall through here.
api.use('/students', studentRecordRoutes);
api.use('/semesters', semesterRoutes);
api.use('/sessions', sessionRoutes);
api.use('/attendance', attendanceRoutes);
api.use('/grades', gradeRoutes);
api.use('/exams', examRoutes);
api.use('/instructors', instructorRoutes);
// These hold full paths (/students/:studentId/at-risk, /grades/:gradeId/appeals, ...), so they
// are mounted at the root of the API router.
api.use(atRiskRoutes);
api.use(appealRoutes);
api.use(transcriptRoutes);
api.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` }));
app.use('/api/v1/academic', api);

// Error handler for errors thrown outside our controllers' try/catch, most commonly
// malformed JSON caught by express.json(). Without this, Express replies with an HTML
// error page; clients of a JSON API should always get JSON back.
// Express recognises error handlers by their four arguments, so `next` must stay.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  console.error('Unhandled error:', err);
  return res.status(err.status || 500).json({ error: 'Internal server error' });
});

module.exports = app;
