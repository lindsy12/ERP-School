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
//
// To add a service: add its *_SERVICE_URL to .env.example and config/env.js, then one entry here.
const { serviceUrls } = require('./env');

function entry(name, baseUrl, prefix) {
  return { name, baseUrl, prefix, healthUrl: `${baseUrl}/health` };
}

module.exports = [
  entry('auth', serviceUrls.auth, '/api/v1/auth'),
  entry('academic', serviceUrls.academic, '/api/v1/academic'),
  entry('finance', serviceUrls.finance, '/api/v1/finance'),
  entry('hr', serviceUrls.hr, '/api/v1/hr'),
  entry('notification', serviceUrls.notification, '/api/v1/notifications'),
];
