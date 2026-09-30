// Builds the gateway app without starting it. Options exist so tests can plug in fake services.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/env');
const registry = require('./config/services');
const defaultPublicRoutes = require('./config/publicRoutes');
const stripIdentityHeaders = require('./middleware/stripIdentityHeaders');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const authenticate = require('./middleware/authenticate');
const { requireAuth, isPublic } = require('./middleware/authenticate');
const createRateLimiters = require('./middleware/rateLimiters');
const serviceProxy = require('./middleware/serviceProxy');
const healthRoutes = require('./routes/health.routes');
const sendError = require('./utils/sendError');

function createApp({
  services = registry,
  verifyUrl = `${config.serviceUrls.auth}/api/v1/auth/verify`,
  verifyTimeoutMs = config.verifyTimeoutMs,
  publicRoutes = defaultPublicRoutes,
  proxyTimeoutMs = config.proxyTimeoutMs,
  healthTimeoutMs = config.healthTimeoutMs,
  corsOrigins = config.corsOrigins,
  rateLimitWindowMs = config.rateLimitWindowMs,
  rateLimitMax = config.rateLimitMax,
  authRateLimitMax = config.authRateLimitMax,
  trustProxy = config.trustProxy,
  logWrite = (line) => process.stdout.write(`${line}
`),
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Which address is "the client"? See TRUST_PROXY in .env.example and docs/scaling-strategy.md.
  app.set('trust proxy', trustProxy);

  // Each service's web pages are public (see uiPrefix in config/services.js).
  const uiRoutes = services
    .filter((service) => service.uiPrefix)
    .flatMap((service) => ['GET', 'HEAD'].map((method) => ({ method, prefix: service.uiPrefix })));
  const isUiRequest = (req) => isPublic(req, uiRoutes);

  const { authLimiter, globalLimiter } = createRateLimiters({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    authMax: authRateLimitMax,
    write: logWrite,
  });

  // 1. FIRST: delete identity headers a client may have forged (see the file for why).
  app.use(stripIdentityHeaders);
  app.use(requestId);
  app.use(requestLogger({ write: logWrite }));
  // Default helmet, minus upgrade-insecure-requests: over plain HTTP on a school network
  // (http://192.168.x.x:3000) it makes browsers ask for every script over HTTPS and pages break.
  // Put it back once the site is served over HTTPS.
  const cspDirectives = { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'upgrade-insecure-requests': null };
  app.use(helmet({ contentSecurityPolicy: { directives: cspDirectives } }));
  // Pages of services marked inlineScripts (config/services.js) get a policy that also allows
  // inline scripts and event handlers; every other page keeps script-src 'self'.
  const inlineScriptPrefixes = services.filter((s) => s.uiPrefix && s.inlineScripts).map((s) => s.uiPrefix);
  const inlineScriptCsp = helmet.contentSecurityPolicy({
    directives: {
      ...cspDirectives,
      'script-src': ["'self'", "'unsafe-inline'"],
      'script-src-attr': ["'unsafe-inline'"],
    },
  });
  app.use((req, res, next) => {
    const underUi = (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`);
    if (inlineScriptPrefixes.some(underUi)) return inlineScriptCsp(req, res, next);
    return next();
  });
  // CORS before authentication: browser preflight (OPTIONS) requests never carry a token.
  app.use(
    cors({
      origin: corsOrigins.length > 0 ? corsOrigins : false,
      exposedHeaders: ['x-request-id'],
      maxAge: 600,
    }),
  );
  // The site's front door is the sign-in page.
  app.get('/', (req, res) => res.redirect(302, '/auth/'));
  // Browsers ask for /favicon.ico on every page; there is none, and without a token it would be a 401.
  app.get('/favicon.ico', (req, res) => res.status(204).end());
  // Page files (HTML/CSS/JS) don't use up the global limit: one page load is a dozen files, and a
  // whole school behind one IP would otherwise run out after a few clicks.
  app.use((req, res, next) => {
    if (isUiRequest(req)) req.skipGlobalRateLimit = true;
    next();
  });

  // 2. Strict per-IP limits on the routes that accept passwords / refresh tokens.
  app.post('/api/v1/auth/login', authLimiter('login'));
  app.post('/api/v1/auth/refresh', authLimiter('refresh'));

  // 3. Work out who the caller is (valid token -> req.user + identity headers)...
  app.use(authenticate({ verifyUrl, timeoutMs: verifyTimeoutMs, publicRoutes: [...publicRoutes, ...uiRoutes] }));
  // 4. ...count the request per user (or per IP, including requests with bad tokens)...
  app.use(globalLimiter);
  // 5. ...and only then reject the ones without a valid token.
  app.use(requireAuth);

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
