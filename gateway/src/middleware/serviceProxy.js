// Builds one proxy per registry entry. Requests matching the prefix are streamed to the service
// untouched: same method, same FULL path, same headers, same body.
const { createProxyMiddleware } = require('http-proxy-middleware');
const sendError = require('../utils/sendError');
const { serviceAgent } = require('../utils/serviceAgent');

// Matches "/api/v1/auth" and "/api/v1/auth/..." but NOT "/api/v1/authors".
function matchesPrefix(prefix) {
  return (pathname) => pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function serviceProxy(service, { timeoutMs }) {
  return createProxyMiddleware({
    target: service.baseUrl,
    // Mounted with app.use(proxy) (no path) + pathFilter, so Express never strips the prefix:
    // with app.use('/api/v1/auth', proxy) the service would receive "/login" instead.
    pathFilter: matchesPrefix(service.prefix),
    changeOrigin: true,
    agent: serviceAgent, // fast, non-blocking DNS (see utils/serviceAgent.js)
    xfwd: true, // adds X-Forwarded-For/-Proto/-Host so the service knows the real client
    on: {
      proxyReq(proxyReq, req) {
        // Our own timeout, instead of the library's proxyTimeout, so we can tell a slow service
        // (504) apart from a dead one (502): both otherwise surface as the same socket error.
        proxyReq.setTimeout(timeoutMs, () => {
          req.gatewayTimedOut = true;
          proxyReq.destroy();
        });
      },
      error(err, req, res) {
        // Response already started (service died mid-answer): nothing clean to send, just close it.
        if (typeof res.writeHead !== 'function' || res.headersSent) {
          res.destroy();
          return;
        }
        if (req.gatewayTimedOut) {
          sendError(res, 504, 'GATEWAY_TIMEOUT', `The ${service.name} service took too long to respond`);
        } else {
          sendError(res, 502, 'SERVICE_UNAVAILABLE', `The ${service.name} service is unavailable, please try again later`);
        }
      },
    },
  });
}

module.exports = serviceProxy;
