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
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

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

// OpenAPI spec (src/docs/openapi.yaml), loaded once at startup, so restart after editing it.
// Keep it in sync with docs/api-contracts/academic-service.md.
const openApiSpec = YAML.load(path.join(__dirname, 'docs', 'openapi.yaml'));

// Every API route lives under /api/v1/academic, the project convention (CLAUDE.md) and the
// prefix the gateway forwards to this service. Each route module keeps its own internal paths;
// only this one mount point sets the prefix. GET /health above stays unprefixed for Docker.
const apiRouter = express.Router();
apiRouter.use('/programs', programRoutes);
apiRouter.use('/courses', courseRoutes);
apiRouter.use('/enrollments', enrollmentRoutes);
apiRouter.use('/students', studentRoutes);
// Second router on the same path: requests that studentRoutes doesn't match fall through here.
apiRouter.use('/students', studentRecordRoutes);
apiRouter.use('/sessions', sessionRoutes);
apiRouter.use('/attendance', attendanceRoutes);
apiRouter.use('/grades', gradeRoutes);
apiRouter.use('/exams', examRoutes);
// These three hold full paths (/students/:studentId/at-risk, /at-risk-students,
// /grades/:gradeId/appeals, /appeals/..., /students/:studentId/transcript/pdf), so they mount at the root.
apiRouter.use(atRiskRoutes);
apiRouter.use(appealRoutes);
apiRouter.use(transcriptRoutes);

// API docs: Swagger UI at /api/v1/academic/docs and the raw spec at /api/v1/academic/openapi.json.
// serveFiles (not serve) gives this mount its own copy of Swagger UI's setup script, which is
// the library's supported way to host more than one UI instance in one app (see /api-docs below).
apiRouter.use('/docs', swaggerUi.serveFiles(openApiSpec), swaggerUi.setup(openApiSpec, { customSiteTitle: 'Academic Service API' }));
apiRouter.get('/openapi.json', (req, res) => res.json(openApiSpec));

app.use('/api/v1/academic', apiRouter);

// Unprefixed aliases for the docs, handy when calling the service directly (not via the gateway).
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Academic Service API' }));
app.get('/openapi.json', (req, res) => res.json(openApiSpec));

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