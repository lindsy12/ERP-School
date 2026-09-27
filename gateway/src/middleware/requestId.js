// Correlation ID: every request gets an x-request-id that follows it through every service,
// so one user action can be traced across all the logs.
//   - If the client sent a sensible x-request-id, keep it; otherwise generate a UUID.
//   - Put it on the request headers (the proxy forwards those to the service).
//   - Send it back in the response headers.
const crypto = require('crypto');

// Only accept short, simple IDs from clients, so nobody can inject junk into our logs.
const VALID_ID = /^[A-Za-z0-9._-]{1,128}$/;

function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  const id = incoming && VALID_ID.test(incoming) ? incoming : crypto.randomUUID();

  req.id = id;
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
}

module.exports = requestId;
