// Checks the caller's access token with auth-service before anything is forwarded.
//
//   public route (config/publicRoutes.js)     -> let it through untouched
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

function isPublic(req, publicRoutes) {
  return publicRoutes.some(
    (route) => (route.method === '*' || route.method === req.method) && route.path === req.path,
  );
}

function authUnavailable(res) {
  sendError(res, 503, 'AUTH_UNAVAILABLE', 'Authentication service is unavailable, please try again later');
}

function authenticate({ verifyUrl, timeoutMs, publicRoutes }) {
  return async (req, res, next) => {
    if (isPublic(req, publicRoutes)) return next();

    const authorization = req.get('authorization') || '';
    if (!BEARER.test(authorization)) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Missing or malformed Authorization header');
    }

    let answer;
    try {
      answer = await httpGet(verifyUrl, {
        headers: { authorization, 'x-request-id': req.id },
        timeoutMs,
      });
    } catch {
      return authUnavailable(res);
    }

    if (answer.status === 401) {
      // Pass auth-service's code through so clients can tell "expired, refresh it" from "invalid".
      let code = 'INVALID_TOKEN';
      let message = 'Access token is invalid';
      try {
        const { error } = JSON.parse(answer.body);
        if (error?.code) ({ code, message } = error);
      } catch {
        // keep the generic message
      }
      return sendError(res, 401, code, message);
    }

    let identity;
    try {
      identity = answer.status === 200 ? JSON.parse(answer.body) : null;
    } catch {
      identity = null;
    }
    if (!identity?.id || !identity.role || !identity.tenant_id) {
      return authUnavailable(res); // auth-service answered, but not with something we can trust
    }

    req.user = identity; // used by the request logger (userId)
    req.headers['x-user-id'] = String(identity.id);
    req.headers['x-user-role'] = String(identity.role);
    req.headers['x-tenant-id'] = String(identity.tenant_id);
    return next();
  };
}

module.exports = authenticate;
module.exports.isPublic = isPublic;
