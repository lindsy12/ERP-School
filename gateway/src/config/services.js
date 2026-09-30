// STATIC SERVICE REGISTRY
//
// This is our documented static service registry. The brief allows either "service discovery
// or a documented static service registry"; we chose static because the set of services is
// fixed and Docker Compose already gives each one a stable DNS name (auth-service, hr-service...).
//
// Each entry says:
//   name      - short id, used in logs, errors and GET /health
//   baseUrl   - where the service listens inside the Docker network (from .env)
//   prefix    - every request whose path starts with this is forwarded to the service,
//               with the FULL path unchanged (/api/v1/auth/login -> auth-service /api/v1/auth/login)
//   healthUrl - the service's own health check, polled by the gateway's GET /health
//   uiPrefix  - where the service serves its own web pages (its client/ folder). GET and HEAD
//               requests under it are forwarded WITHOUT a token check, because a browser opening
//               a page can't send one; the pages then call the API with the token themselves.
//               So never serve anything but static files under a uiPrefix.
//   inlineScripts - true if the service's pages use inline <script> blocks and onclick="..." handlers,
//               which the gateway's Content-Security-Policy blocks everywhere else. Only academic's
//               pages need it; new pages should load their scripts from files instead.
//
// To add a service: add its *_SERVICE_URL to .env.example and config/env.js, then one entry here.
const { serviceUrls } = require('./env');

function entry(name, baseUrl, prefix, uiPrefix, { inlineScripts = false } = {}) {
  return { name, baseUrl, prefix, uiPrefix, inlineScripts, healthUrl: `${baseUrl}/health` };
}

module.exports = [
  entry('auth', serviceUrls.auth, '/api/v1/auth', '/auth'),
  entry('academic', serviceUrls.academic, '/api/v1/academic', '/academic', { inlineScripts: true }),
  entry('finance', serviceUrls.finance, '/api/v1/finance', '/finance'),
  entry('hr', serviceUrls.hr, '/api/v1/hr', '/hr'),
  entry('notification', serviceUrls.notification, '/api/v1/notifications', '/notifications'),
];
