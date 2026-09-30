// Checks request bodies before they reach any business logic.
// Collects every problem at once so the client can fix them all in one go.
const HttpError = require('../utils/httpError');
const { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } = require('../utils/password');
const { ROLES } = require('../config/roles');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MAX_REFRESH_TOKEN_LENGTH = 128; // issued tokens are 43 chars; anything far longer is junk
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

const invalid = (errors) => new HttpError(400, 'VALIDATION_ERROR', 'Request body is invalid', errors);

function requireObject(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object');
  }
}

// Returns the email trimmed and lower-cased (how it is stored), or '' after recording an error.
function checkEmail(email, errors) {
  const clean = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!clean || clean.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(clean)) {
    errors.push({ field: 'email', message: 'must be a valid email address' });
    return '';
  }
  return clean;
}

// A password being typed in to log in: any non-empty string bcrypt can handle.
function checkExistingPassword(password, field, errors) {
  if (typeof password !== 'string' || password.length === 0) {
    errors.push({ field, message: 'is required' });
  } else if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    errors.push({ field, message: `must be at most ${MAX_PASSWORD_BYTES} bytes` });
  }
}

// A password being set: the same, plus a minimum length.
function checkNewPassword(password, field, errors) {
  const before = errors.length;
  checkExistingPassword(password, field, errors);
  if (errors.length === before && password.length < MIN_PASSWORD_LENGTH) {
    errors.push({ field, message: `must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
}

function checkRole(role, errors) {
  if (!ROLES.includes(role)) {
    errors.push({ field: 'role', message: `must be one of ${ROLES.join(', ')}` });
  }
}

// Fields a client may not send, e.g. a password to PATCH /users/:id, which would otherwise be ignored silently.
function checkOnly(body, allowed, errors) {
  for (const field of Object.keys(body)) {
    if (!allowed.includes(field)) errors.push({ field, message: 'is not allowed' });
  }
}

function validateLogin(body) {
  requireObject(body);
  const { tenant_id: tenantId, email, password } = body;
  const errors = [];

  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
    errors.push({ field: 'tenant_id', message: 'must be a UUID' });
  }
  const cleanEmail = checkEmail(email, errors);
  checkExistingPassword(password, 'password', errors);

  if (errors.length > 0) throw invalid(errors);
  return { tenantId, email: cleanEmail, password };
}

// Body of /refresh and /logout: { refresh_token }.
function validateRefreshToken(body) {
  requireObject(body);
  const { refresh_token: refreshToken } = body;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0 || refreshToken.length > MAX_REFRESH_TOKEN_LENGTH) {
    throw invalid([{ field: 'refresh_token', message: 'is required' }]);
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

// POST /users: { email, password, role }.
function validateCreateUser(body) {
  requireObject(body);
  const errors = [];
  checkOnly(body, ['email', 'password', 'role'], errors);
  const email = checkEmail(body.email, errors);
  checkNewPassword(body.password, 'password', errors);
  checkRole(body.role, errors);

  if (errors.length > 0) throw invalid(errors);
  return { email, password: body.password, role: body.role };
}

// PATCH /users/:id: { role?, is_active? }, at least one of them.
function validateUpdateUser(body) {
  requireObject(body);
  const errors = [];
  checkOnly(body, ['role', 'is_active'], errors);
  if (body.role === undefined && body.is_active === undefined) {
    errors.push({ field: 'role', message: 'role or is_active is required' });
  }
  if (body.role !== undefined) checkRole(body.role, errors);
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    errors.push({ field: 'is_active', message: 'must be true or false' });
  }

  if (errors.length > 0) throw invalid(errors);
  return { role: body.role, isActive: body.is_active };
}

// GET /users?role=&page=&limit=
function validateListQuery(query) {
  const errors = [];
  const toInt = (value, field, fallback, max) => {
    if (value === undefined) return fallback;
    const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!(n >= 1 && n <= max)) {
      errors.push({ field, message: `must be a whole number from 1 to ${max}` });
      return fallback;
    }
    return n;
  };

  const page = toInt(query.page, 'page', 1, Number.MAX_SAFE_INTEGER);
  const limit = toInt(query.limit, 'limit', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if (query.role !== undefined) checkRole(query.role, errors);

  if (errors.length > 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Request is invalid', errors);
  return { role: query.role, page, limit };
}

// POST /change-password: { current_password, new_password }.
function validateChangePassword(body) {
  requireObject(body);
  const errors = [];
  checkExistingPassword(body.current_password, 'current_password', errors);
  checkNewPassword(body.new_password, 'new_password', errors);
  if (errors.length === 0 && body.new_password === body.current_password) {
    errors.push({ field: 'new_password', message: 'must be different from the current password' });
  }

  if (errors.length > 0) throw invalid(errors);
  return { currentPassword: body.current_password, newPassword: body.new_password };
}

// POST /users/:id/reset-password: { new_password }.
function validateResetPassword(body) {
  requireObject(body);
  const errors = [];
  checkNewPassword(body.new_password, 'new_password', errors);

  if (errors.length > 0) throw invalid(errors);
  return body.new_password;
}

module.exports = {
  validateLogin,
  validateRefreshToken,
  validateUserId,
  validateCreateUser,
  validateUpdateUser,
  validateListQuery,
  validateChangePassword,
  validateResetPassword,
};
