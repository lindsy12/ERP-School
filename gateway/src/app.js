// Builds the gateway app without starting it. Options exist so tests can plug in fake services.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/env');
const registry = require('./config/services');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const stripIdentityHeaders = require('./middleware/stripIdentityHeaders');
const serviceProxy = require('./middleware/serviceProxy');
const healthRoutes = require('./routes/health.routes');
const sendError = require('./utils/sendError');

function createApp({
  services = registry,
  proxyTimeoutMs = config.proxyTimeoutMs,
  healthTimeoutMs = config.healthTimeoutMs,
  corsOrigins = config.corsOrigins,
  logWrite,
} = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(requestLogger({ write: logWrite }));
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins.length > 0 ? corsOrigins : false,
      exposedHeaders: ['x-request-id'],
      maxAge: 600,
    }),
  );
  app.use(stripIdentityHeaders);

  app.use('/health', healthRoutes({ services, timeoutMs: healthTimeoutMs }));

  // IMPORTANT: no express.json() before the proxies. It would read the request body stream
  // into req.body, leaving nothing for the proxy to forward, and POSTs would hang or arrive empty.
  for (const service of services) {
    app.use(serviceProxy(service, { timeoutMs: proxyTimeoutMs }));
  }

  app.use((req, res) => {
    sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  });

  return app;
}

module.exports = createApp;
