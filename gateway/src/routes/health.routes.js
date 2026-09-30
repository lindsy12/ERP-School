// GET /health: the gateway's own status plus every registered service's /health.
// Always answers 200 while the gateway itself is running; a down service makes the
// overall status "degraded" instead of failing the whole check.
const { Router } = require('express');
const httpGet = require('../utils/httpGet');

async function checkService(service, timeoutMs) {
  const start = Date.now();
  try {
    const { status } = await httpGet(service.healthUrl, { timeoutMs });
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
