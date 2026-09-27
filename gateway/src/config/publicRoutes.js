// PUBLIC ROUTES: the only requests that reach a service WITHOUT a valid access token.
// Everything else must send "Authorization: Bearer <token>", which the gateway checks with
// auth-service before forwarding. Paths must match exactly (no prefixes, no trailing slash);
// method '*' means any method.
//
// Keep this list short, and document every change in docs/gateway.md.
module.exports = [
  { method: 'POST', path: '/api/v1/auth/login' },
  { method: 'POST', path: '/api/v1/auth/refresh' },
  { method: '*', path: '/health' },
];
