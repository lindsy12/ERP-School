// Builds the Express app without starting it, so tests can use it directly.
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const openapiSpec = require('./docs/openapi');
const errorHandler = require('./middleware/errorHandler');
const HttpError = require('./utils/httpError');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

app.use('/health', healthRoutes);

app.get('/api/v1/auth/openapi.json', (req, res) => res.json(openapiSpec));
app.use('/api/v1/auth/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use('/api/v1/auth', authRoutes);

app.use((req, res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
});

app.use(errorHandler);

module.exports = app;
