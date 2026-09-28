// Checks request bodies before they reach any business logic.
// Collects every problem at once so the client can fix them all in one go.
const HttpError = require('../utils/httpError');
const { MAX_PASSWORD_BYTES } = require('../utils/password');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;

function validateLogin(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object');
  }

  const { tenant_id: tenantId, email, password } = body;
  const errors = [];

  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
    errors.push({ field: 'tenant_id', message: 'must be a UUID' });
  }

  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail || cleanEmail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(cleanEmail)) {
    errors.push({ field: 'email', message: 'must be a valid email address' });
  }

  if (typeof password !== 'string' || password.length === 0) {
    errors.push({ field: 'password', message: 'is required' });
  } else if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    errors.push({ field: 'password', message: `must be at most ${MAX_PASSWORD_BYTES} bytes` });
  }

  if (errors.length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body is invalid', errors);
  }

  return { tenantId, email: cleanEmail, password };
}

module.exports = { validateLogin };
