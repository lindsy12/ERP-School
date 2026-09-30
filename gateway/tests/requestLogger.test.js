const request = require('supertest');
const createApp = require('../src/app');
const { startEchoService, registryEntry } = require('./helpers');

let auth;
beforeAll(async () => {
  auth = await startEchoService('auth');
});
afterAll(() => auth.close());

it('logs one JSON line per request with the required fields', async () => {
  const lines = [];
  const app = createApp({
    services: [registryEntry('auth', auth.url, '/api/v1/auth')],
    logWrite: (line) => lines.push(line),
  });

  const res = await request(app).post('/api/v1/auth/login?token=secret').send({ a: 1 });
  await new Promise((resolve) => setImmediate(resolve));

  expect(lines).toHaveLength(1);
  const entry = JSON.parse(lines[0]);
  expect(entry).toEqual({
    time: expect.any(String),
    requestId: res.headers['x-request-id'],
    method: 'POST',
    path: '/api/v1/auth/login', // query string left out on purpose
    status: 201,
    durationMs: expect.any(Number),
  });
  expect(Number.isNaN(Date.parse(entry.time))).toBe(false);
});
