// Rate limiting: how many requests one client may send per time window.
//
//   authLimiter(path) - strict, per IP, for POST login / refresh: slows down password guessing.
//   globalLimiter     - every route, per USER when logged in (so classmates behind the same school
//                       Wi-Fi don't share one budget), per IP otherwise.
//
// Counts are kept in memory (express-rate-limit's MemoryStore). That is correct for ONE gateway
// instance only; with several replicas they need a shared store such as Redis
// (see docs/scaling-strategy.md).
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const sendError = require('../utils/sendError');

// ipKeyGenerator groups IPv6 addresses by /56 network: one IPv6 user owns many addresses,
// and without this they could rotate through them to escape the limit.
const ipKey = (req) => `ip:${ipKeyGenerator(req.ip)}`;

function onLimitReached(name, write) {
  return (req, res, next, options) => {
    const info = req[options.requestPropertyName];
    const retryAfter = Number(res.getHeader('Retry-After')) || Math.ceil(options.windowMs / 1000);
    write(
      JSON.stringify({
        time: new Date().toISOString(),
        event: 'rate_limited',
        limiter: name,
        requestId: req.id,
        key: info.key,
        method: req.method,
        path: req.path,
        limit: info.limit,
      }),
    );
    sendError(res, 429, 'RATE_LIMITED', `Too many requests, please try again in ${retryAfter} seconds`);
  };
}

function limiter({ name, windowMs, max, keyGenerator, skip, write }) {
  return rateLimit({
    windowMs,
    limit: max,
    keyGenerator,
    skip,
    standardHeaders: 'draft-7', // RateLimit and RateLimit-Policy headers (IETF draft standard)
    legacyHeaders: false, // no old X-RateLimit-* headers
    requestPropertyName: `rateLimit_${name}`, // each limiter keeps its own req info
    handler: onLimitReached(name, write),
  });
}

// Routes with their own strict limiter skip the global one, so the client sees ONE consistent set
// of RateLimit headers (the strict ones) instead of the global limiter overwriting them.
function skipGlobal(req, res, next) {
  req.skipGlobalRateLimit = true;
  next();
}

function createRateLimiters({ windowMs, max, authMax, write }) {
  return {
    // A separate counter per route, so refreshing tokens can't lock someone out of logging in.
    authLimiter: (route) => [
      skipGlobal,
      limiter({ name: `auth:${route}`, windowMs, max: authMax, keyGenerator: ipKey, write }),
    ],

    globalLimiter: limiter({
      name: 'global',
      windowMs,
      max,
      // req.user is set by authenticate (from auth-service's /verify) only for a valid token.
      keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKey(req)),
      // Docker and monitoring poll /health constantly; never lock them out.
      skip: (req) => req.path === '/health' || req.skipGlobalRateLimit === true,
      write,
    }),
  };
}

module.exports = createRateLimiters;
