// Checks the caller's access token with auth-service. Split in two steps so the global rate
// limiter can run IN BETWEEN: it needs to know who the user is, and requests with bad tokens
// must still be counted (by IP) instead of escaping the limit.
//
//   authenticate()   - public route: do nothing. Otherwise ask auth-service and either set
//                      req.user + identity headers, or remember the failure in req.authError.
//   requireAuth      - send the remembered failure, if any.
//
//   no "Authorization: Bearer <token>"        -> 401 UNAUTHORIZED
//   auth-service says the token is bad        -> 401 with auth-service's code (INVALID_TOKEN, TOKEN_EXPIRED...)
//   auth-service down / slow / broken answer  -> 503 AUTH_UNAVAILABLE
//   token OK                                  -> set x-user-id, x-user-role, x-tenant-id and forward
//
// The gateway does not check the JWT signature itself: auth-service is the only one holding
// JWT_SECRET, and it also rejects users disabled after their token was issued.
const httpGet = require('../utils/httpGet');
const sendError = require('../utils/sendError');

const BEARER = /^Bearer\s+(\S+)$/i;
const AUTH_UNAVAILABLE = {
  status: 503,
  code: 'AUTH_UNAVAILABLE',
  message: 'Authentication service is unavailable, please try again later',
};

// A route has either an exact `path`, or a `prefix` that matches whole path segments
// ("/hr" matches "/hr" and "/hr/js/app.js", not "/hrx").
function isPublic(req, publicRoutes) {
  return publicRoutes.some((route) => {
    if (route.method !== '*' && route.method !== req.method) return false;
    if (route.prefix) return req.path === route.prefix || req.path.startsWith(`${route.prefix}/`);
    return route.path === req.path;
  });
}

// Returns { identity } on success or { error: { status, code, message } }.
async function verifyToken(req, { verifyUrl, timeoutMs }) {
  const authorization = req.get('authorization') || '';
  if (!BEARER.test(authorization)) {
    return { error: { status: 401, code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' } };
  }

  let answer;
  try {
    answer = await httpGet(verifyUrl, { headers: { authorization, 'x-request-id': req.id }, timeoutMs });
  } catch {
    return { error: AUTH_UNAVAILABLE };
  }

  if (answer.status === 401) {
    // Pass auth-service's code through so clients can tell "expired, refresh it" from "invalid".
    const error = { status: 401, code: 'INVALID_TOKEN', message: 'Access token is invalid' };
    try {
      const body = JSON.parse(answer.body);
      if (body.error?.code) Object.assign(error, { code: body.error.code, message: body.error.message });
    } catch {
      // keep the generic message
    }
    return { error };
  }

  let identity;
  try {
    identity = answer.status === 200 ? JSON.parse(answer.body) : null;
  } catch {
    identity = null;
  }
  if (!identity?.id || !identity.role || !identity.tenant_id) {
    return { error: AUTH_UNAVAILABLE }; // auth-service answered, but not with something we can trust
  }
  return { identity };
}

function authenticate({ verifyUrl, timeoutMs, publicRoutes }) {
  return async (req, res, next) => {
    if (isPublic(req, publicRoutes)) return next();

    const { identity, error } = await verifyToken(req, { verifyUrl, timeoutMs });
    if (error) {
      req.authError = error;
      return next();
    }

    req.user = identity; // used by the rate limiter (key) and the request logger (userId)
    req.headers['x-user-id'] = String(identity.id);
    req.headers['x-user-role'] = String(identity.role);
    req.headers['x-tenant-id'] = String(identity.tenant_id);
    // Lets a service find its own record for this account (e.g. academic's student by email).
    if (identity.email) req.headers['x-user-email'] = String(identity.email);
    return next();
  };
}

function requireAuth(req, res, next) {
  if (req.authError) {
    const { status, code, message } = req.authError;
    return sendError(res, status, code, message);
  }
  return next();
}

module.exports = authenticate;
module.exports.requireAuth = requireAuth;
module.exports.isPublic = isPublic;
