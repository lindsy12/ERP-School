const http = require('http');
const request = require('supertest');
const createApp = require('../src/app');
const { startEchoService, deadServiceUrl, registryEntry } = require('./helpers');

let auth;
let hanging;

beforeAll(async () => {
  auth = await startEchoService('auth');
  // A service that accepts the connection but never answers.
  hanging = http.createServer(() => {});
  await new Promise((resolve) => hanging.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
  await auth.close();
  hanging.closeAllConnections();
  await new Promise((resolve) => hanging.close(resolve));
});

describe('GET /health', () => {
  it('reports ok when every service is up', async () => {
    const app = createApp({ services: [registryEntry('auth', auth.url, '/api/v1/auth')], logWrite: () => {} });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      service: 'gateway',
      services: { auth: { status: 'up', latencyMs: expect.any(Number) } },
    });
  });

  it('reports degraded, not an error, when services are down or hanging', async () => {
    const app = createApp({
      services: [
        registryEntry('auth', auth.url, '/api/v1/auth'),
        registryEntry('hr', await deadServiceUrl(), '/api/v1/hr'),
        registryEntry('finance', `http://127.0.0.1:${hanging.address().port}`, '/api/v1/finance'),
      ],
      healthTimeoutMs: 200,
      logWrite: () => {},
    });

    const started = Date.now();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.auth.status).toBe('up');
    expect(res.body.services.hr).toEqual({ status: 'down', error: 'ECONNREFUSED' });
    expect(res.body.services.finance).toEqual({ status: 'down', error: 'timeout' });
    expect(Date.now() - started).toBeLessThan(1500); // checks run in parallel, each capped
  });
});

