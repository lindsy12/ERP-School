// Builds the app without starting it (src/server.js listens), so tests can use it directly.
const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const pool = require('./db/connection');
const identify = require('./middleware/identify');
const errorHandler = require('./middleware/errorHandler');
const notificationsRoutes = require('./routes/notifications.routes');
const openapi = require('./docs/openapi');
const HttpError = require('./utils/httpError');

const app = express();
app.disable('x-powered-by');
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'notification-service', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', service: 'notification-service', db: 'not connected' });
  }
});

// The notifications page (client/). The gateway forwards GET /notifications/* here without a
// token check, so only static files may live under this path.
app.use('/notifications', express.static(path.join(__dirname, '..', 'client')));

app.get('/api/v1/notifications/openapi.json', (req, res) => res.json(openapi));
app.use('/api/v1/notifications/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use('/api/v1/notifications', identify, notificationsRoutes);

app.use((req, res, next) => next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`)));
app.use(errorHandler);

module.exports = app;
