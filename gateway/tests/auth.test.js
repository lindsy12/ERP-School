// Gateway authentication. auth-service's /verify is replaced by a small fake server
// (tests/helpers.js startFakeAuth), so these run without Docker or a database.
const request = require('supertest');
const createApp = require('../src/app');
const { isPublic } = require('../src/middleware/authenticate');
const publicRoutes = require('../src/config/publicRoutes');
const { startEchoService, deadServiceUrl, registryEntry, startFakeAuth, TEST_USERS } = require('./helpers');

let service;
let fakeAuth;

beforeAll(async () => {
  service = await startEchoService('auth');
  fakeAuth = await startFakeAuth();
});

afterAll(async () => {
  await Promise.all([service.close(), fakeAuth.close()]);
});

const appWith = (overrides = {}) =>
  createApp({
    services: [
      registryEntry('auth', service.url, '/api/v1/auth'),
      registryEntry('hr', service.url, '/api/v1/hr'),
    ],
    verifyUrl: fakeAuth.verifyUrl,
    verifyTimeoutMs: 300,
    healthTimeoutMs: 300,
    logWrite: () => {},
    ...overrides,
  });

describe('public routes', () => {
  it('POST /api/v1/auth/login works without a token and never calls /verify', async () => {
    const callsBefore = fakeAuth.calls.length;

    const res = await request(appWith()).post('/api/v1/auth/login').send({ email: 'a@b.co' });

    expect(res.status).toBe(201);
    expect(res.body.url).toBe('/api/v1/auth/login');
    expect(fakeAuth.calls.length).toBe(callsBefore);
  });

  it('POST /api/v1/auth/refresh works without a token', async () => {
    const res = await request(appWith()).post('/api/v1/auth/refresh').send({ refresh_token: 'x' });

    expect(res.status).toBe(201);
  });

  it('GET /health works without a token', async () => {
    const res = await request(appWith()).get('/health');

    expect(res.status).toBe(200);
  });

  it('public means exact method + path, nothing broader', () => {
    const is = (method, path) => isPublic({ method, path }, publicRoutes);

    expect(is('POST', '/api/v1/auth/login')).toBe(true);
    expect(is('GET', '/api/v1/auth/login')).toBe(false); // wrong method
    expect(is('POST', '/api/v1/auth/login/extra')).toBe(false); // longer path
    expect(is('POST', '/api/v1/auth/loginx')).toBe(false);
    expect(is('GET', '/api/v1/auth/me')).toBe(false);
  });
});

describe('protected routes', () => {
  it('401 UNAUTHORIZED with no token, and nothing is forwarded', async () => {
    const res = await request(appWith()).get('/api/v1/hr/employees');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' },
    });
  });

  it('401 for a non-Bearer Authorization header', async () => {
    const res = await request(appWith()).get('/api/v1/hr/employees').set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
  });

  it("401 with auth-service's own code when it rejects the token", async () => {
    const invalid = await request(appWith()).get('/api/v1/hr/employees').set('Authorization', 'Bearer made-up');
    const expired = await request(appWith()).get('/api/v1/hr/employees').set('Authorization', 'Bearer expired-token');

    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('INVALID_TOKEN');
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('valid token: identity headers are added and the request is forwarded', async () => {
    const res = await request(appWith()).get('/api/v1/hr/employees').set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(201);
    expect(res.body.url).toBe('/api/v1/hr/employees');
    expect(res.body.headers['x-user-id']).toBe(TEST_USERS['good-token'].id);
    expect(res.body.headers['x-user-role']).toBe('STAFF');
    expect(res.body.headers['x-tenant-id']).toBe('tenant-abc');
  });

  it('sends the caller\'s token and request id to /verify', async () => {
    const res = await request(appWith())
      .get('/api/v1/hr/employees')
      .set('Authorization', 'Bearer good-token')
      .set('x-request-id', 'trace-42');

    const lastCall = fakeAuth.calls.at(-1);
    expect(res.status).toBe(201);
    expect(lastCall.url).toBe('/api/v1/auth/verify');
    expect(lastCall.headers.authorization).toBe('Bearer good-token');
    expect(lastCall.headers['x-request-id']).toBe('trace-42');
  });

  it('logs the userId of an authenticated request', async () => {
    const lines = [];
    await request(appWith({ logWrite: (line) => lines.push(line) }))
      .get('/api/v1/hr/employees')
      .set('Authorization', 'Bearer good-token');
    await new Promise((resolve) => setImmediate(resolve));

    expect(JSON.parse(lines[0]).userId).toBe('user-123');
  });
});

describe('header spoofing', () => {
  it('client-sent x-user-role: SUPER_ADMIN is removed and replaced by the real role', async () => {
    const res = await request(appWith())
      .get('/api/v1/hr/employees')
      .set('Authorization', 'Bearer good-token')
      .set('x-user-id', 'someone-else')
      .set('x-user-role', 'SUPER_ADMIN')
      .set('x-tenant-id', 'other-school');

    expect(res.body.headers['x-user-id']).toBe('user-123');
    expect(res.body.headers['x-user-role']).toBe('STAFF');
    expect(res.body.headers['x-tenant-id']).toBe('tenant-abc');
  });

  it('forged identity headers are also removed on public routes', async () => {
    const res = await request(appWith())
      .post('/api/v1/auth/login')
      .set('x-user-role', 'SUPER_ADMIN')
      .set('x-tenant-id', 'other-school')
      .set('x-user-anything', 'x')
      .send({});

    expect(res.body.headers['x-user-role']).toBeUndefined();
    expect(res.body.headers['x-tenant-id']).toBeUndefined();
    expect(res.body.headers['x-user-anything']).toBeUndefined();
  });

  it('forged headers alone, without a token, get 401', async () => {
    const res = await request(appWith()).get('/api/v1/hr/employees').set('x-user-role', 'SUPER_ADMIN');

    expect(res.status).toBe(401);
  });
});

describe('auth-service problems -> 503 AUTH_UNAVAILABLE', () => {
  const expect503 = async (app) => {
    const res = await request(app).get('/api/v1/hr/employees').set('Authorization', 'Bearer good-token');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AUTH_UNAVAILABLE');
  };

  it('when auth-service is down', async () => {
    await expect503(appWith({ verifyUrl: `${await deadServiceUrl()}/api/v1/auth/verify` }));
  });

  it('when auth-service is too slow (timeout)', async () => {
    const slowAuth = await startFakeAuth({ mode: 'slow' });
    try {
      await expect503(appWith({ verifyUrl: slowAuth.verifyUrl }));
    } finally {
      await slowAuth.close();
    }
  });

  it('when auth-service answers 500 or something that is not an identity', async () => {
    for (const mode of ['error500', 'garbage']) {
      const brokenAuth = await startFakeAuth({ mode });
      try {
        await expect503(appWith({ verifyUrl: brokenAuth.verifyUrl }));
      } finally {
        await brokenAuth.close();
      }
    }
  });
});
