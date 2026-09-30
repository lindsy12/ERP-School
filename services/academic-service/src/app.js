require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const programRoutes = require('./routes/programRoutes');
const courseRoutes = require('./routes/courseRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const studentRoutes = require('./routes/studentRoutes');
const studentRecordRoutes = require('./routes/studentRecordRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const gradeRoutes = require('./routes/gradeRoutes');
const atRiskRoutes = require('./routes/atRiskRoutes');
const examRoutes = require('./routes/examRoutes');
const appealRoutes = require('./routes/appealRoutes');
const transcriptRoutes = require('./routes/transcriptRoutes');
const rabbitmq = require('./services/rabbitmq');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'academic-service', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Feature routers, versioned under /api/v1 so a future v2 can live alongside them.
app.use('/api/v1/programs', programRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/enrollments', enrollmentRoutes);
app.use('/api/v1/students', studentRoutes);
// Second router on the same path: requests that studentRoutes doesn't match fall through here.
app.use('/api/v1/students', studentRecordRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/grades', gradeRoutes);
app.use('/api/v1/exams', examRoutes);
// Holds full paths (/students/:studentId/at-risk and /at-risk-students), so it's mounted at /api/v1.
app.use('/api/v1', atRiskRoutes);
// Also hold full paths (/grades/:gradeId/appeals, /appeals/..., /students/:studentId/transcript/pdf).
app.use('/api/v1', appealRoutes);
app.use('/api/v1', transcriptRoutes);

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
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

// Only start listening (and connect to RabbitMQ) when this file is run directly, e.g.
// `node src/app.js`, nodemon or the Dockerfile. When it's require()d, e.g. by the Jest/Supertest
// tests, it just exports the configured app, so no port is bound and no broker is needed.
if (require.main === module) {
  const PORT = process.env.PORT || 4002;
  app.listen(PORT, () => {
    console.log(`Academic service running on port ${PORT}`);
    // Connect to RabbitMQ in the background so config problems show up in the logs right away.
    // It never throws, and the service stays up even if the broker is unreachable.
    rabbitmq.connect();
  });
}

module.exports = app;