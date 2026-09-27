// Checks request bodies before they reach any business logic.
// Collects every problem at once so the client can fix them all in one go.
const HttpError = require('../utils/httpError');
const { MAX_PASSWORD_BYTES } = require('../utils/password');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MAX_REFRESH_TOKEN_LENGTH = 128; // issued tokens are 43 chars; anything far longer is junk

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

// Body of /refresh and /logout: { refresh_token }.
function validateRefreshToken(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object');
  }

  const { refresh_token: refreshToken } = body;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0 || refreshToken.length > MAX_REFRESH_TOKEN_LENGTH) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body is invalid', [
      { field: 'refresh_token', message: 'is required' },
    ]);
  }

  return refreshToken;
}

// Path parameter :id of /users/:id/...
function validateUserId(id) {
  if (!UUID_RE.test(id)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request is invalid', [{ field: 'id', message: 'must be a UUID' }]);
  }
  return id;
}

module.exports = { validateLogin, validateRefreshToken, validateUserId };
