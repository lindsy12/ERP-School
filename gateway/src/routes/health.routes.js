// GET /health: the gateway's own status plus every registered service's /health.
// Always answers 200 while the gateway itself is running; a down service makes the
// overall status "degraded" instead of failing the whole check.
const http = require('http');
const { Router } = require('express');
const { serviceAgent } = require('../utils/serviceAgent');

// Resolves with the HTTP status code, or rejects (code TIMEOUT, ECONNREFUSED, ENOTFOUND...).
function getStatus(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: serviceAgent }, (res) => {
      clearTimeout(timer);
      res.resume(); // we only need the status; discard the body
      resolve(res.statusCode);
    });
    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }));
    }, timeoutMs);
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function checkService(service, timeoutMs) {
  const start = Date.now();
  try {
    const status = await getStatus(service.healthUrl, timeoutMs);
    const latencyMs = Date.now() - start;
    return status === 200
      ? { status: 'up', latencyMs }
      : { status: 'down', latencyMs, error: `HTTP ${status}` };
  } catch (err) {
    return { status: 'down', error: err.code === 'TIMEOUT' ? 'timeout' : err.code || err.message };
  }
}

function healthRoutes({ services, timeoutMs }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const results = await Promise.all(services.map((service) => checkService(service, timeoutMs)));
    const byName = Object.fromEntries(services.map((service, i) => [service.name, results[i]]));
    const allUp = results.every((result) => result.status === 'up');

    res.json({ status: allUp ? 'ok' : 'degraded', service: 'gateway', services: byName });
  });

  return router;
}

module.exports = healthRoutes;
