const request = require('supertest');
const createApp = require('../src/app');
const { startEchoService, registryEntry, startFakeAuth } = require('./helpers');

let service;
let fakeAuth;
let logs;

beforeAll(async () => {
  service = await startEchoService('auth');
  fakeAuth = await startFakeAuth();
});

afterAll(async () => {
  await Promise.all([service.close(), fakeAuth.close()]);
});

beforeEach(() => {
  logs = [];
});

// Every call builds a fresh app, so each test starts with empty counters.
const appWith = (overrides = {}) =>
  createApp({
    services: [
      registryEntry('auth', service.url, '/api/v1/auth'),
      registryEntry('hr', service.url, '/api/v1/hr'),
    ],
    verifyUrl: fakeAuth.verifyUrl,
    healthTimeoutMs: 300,
    rateLimitWindowMs: 60000,
    rateLimitMax: 100,
    authRateLimitMax: 10,
    logWrite: (line) => logs.push(JSON.parse(line)),
    ...overrides,
  });

const login = (app) => request(app).post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'guess' });
const asUser = (req, token = 'good-token') => req.set('Authorization', `Bearer ${token}`);
const rateLimitLogs = () => logs.filter((entry) => entry.event === 'rate_limited');

describe('login brute-force limit', () => {
  it('the 11th login request in a minute gets 429', async () => {
    const app = appWith();

    for (let i = 1; i <= 10; i += 1) {
      expect((await login(app)).status).toBe(201);
    }
    const res = await login(app);

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: { code: 'RATE_LIMITED', message: expect.stringMatching(/try again in \d+ seconds/) },
    });
  });

  it('sends standard RateLimit headers and Retry-After', async () => {
    const app = appWith({ authRateLimitMax: 2 });

    const ok = await login(app);
    await login(app);
    const limited = await login(app);

    expect(ok.headers['ratelimit-policy']).toBe('2;w=60');
    expect(ok.headers.ratelimit).toMatch(/limit=2, remaining=1, reset=\d+/);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers.ratelimit).toMatch(/remaining=0/);
  });

  it('logs every 429 as a JSON line with requestId and key', async () => {
    const app = appWith({ authRateLimitMax: 1 });

    await login(app);
    const limited = await login(app).set('x-request-id', 'trace-429');

    expect(limited.status).toBe(429);
    expect(rateLimitLogs()).toEqual([
      expect.objectContaining({
        event: 'rate_limited',
        limiter: 'auth:login',
        requestId: 'trace-429',
        key: expect.stringMatching(/^ip:/),
        method: 'POST',
        path: '/api/v1/auth/login',
      }),
    ]);
  });

  it('login and refresh have separate counters', async () => {
    const app = appWith({ authRateLimitMax: 1 });

    await login(app);
    expect((await login(app)).status).toBe(429);
    expect((await request(app).post('/api/v1/auth/refresh').send({})).status).toBe(201);
  });

  it('faking X-Forwarded-For does not give a fresh counter (TRUST_PROXY=false)', async () => {
    const app = appWith({ authRateLimitMax: 2 });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // library warns once about the header

    const statuses = [];
    for (let i = 1; i <= 3; i += 1) {
      statuses.push((await login(app).set('X-Forwarded-For', `203.0.113.${i}`)).status);
    }

    expect(statuses).toEqual([201, 201, 429]);
    errorSpy.mockRestore();
  });

  it('with TRUST_PROXY=1, the address added by our proxy is used', async () => {
    const app = appWith({ authRateLimitMax: 1, trustProxy: 1 });

    expect((await login(app).set('X-Forwarded-For', '203.0.113.1')).status).toBe(201);
    expect((await login(app).set('X-Forwarded-For', '203.0.113.1')).status).toBe(429);
    expect((await login(app).set('X-Forwarded-For', '203.0.113.2')).status).toBe(201);
  });
});

describe('global limit', () => {
  it('normal routes still work while login is blocked', async () => {
    const app = appWith({ authRateLimitMax: 1 });
    await login(app);
    expect((await login(app)).status).toBe(429);

    expect((await asUser(request(app).get('/api/v1/hr/employees'))).status).toBe(201);
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('counts logged-in users by user id, each with their own budget', async () => {
    const app = appWith({ rateLimitMax: 2 });
    const get = (token) => asUser(request(app).get('/api/v1/hr/employees'), token);

    expect((await get('good-token')).status).toBe(201);
    expect((await get('good-token')).status).toBe(201);
    expect((await get('good-token')).status).toBe(429);
    // Same IP, different user: not affected.
    expect((await get('admin-token')).status).toBe(201);
    expect(rateLimitLogs()[0]).toMatchObject({ limiter: 'global', key: 'user:user-123' });
  });

  it('counts requests with bad tokens by IP, so they cannot escape the limit', async () => {
    const app = appWith({ rateLimitMax: 2 });
    const bad = () => asUser(request(app).get('/api/v1/hr/employees'), 'made-up');

    expect((await bad()).status).toBe(401);
    expect((await bad()).status).toBe(401);
    expect((await bad()).status).toBe(429);
    expect(rateLimitLogs()[0].key).toMatch(/^ip:/);
  });

  it('never limits /health', async () => {
    const app = appWith({ rateLimitMax: 1 });

    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/health')).status).toBe(200);
    }
  });
});

describe('limits come from env', () => {
  const ENV_KEYS = ['RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX', 'AUTH_RATE_LIMIT_MAX', 'TRUST_PROXY'];
  let saved;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // Load config/app fresh, as if the gateway had just started with these variables.
  const freshModules = () => {
    let modules;
    jest.isolateModules(() => {
      modules = { config: require('../src/config/env'), createApp: require('../src/app') };
    });
    return modules;
  };

  it('uses the documented defaults when nothing is set', () => {
    ENV_KEYS.forEach((key) => delete process.env[key]);

    const { config } = freshModules();

    expect(config).toMatchObject({
      rateLimitWindowMs: 60000,
      rateLimitMax: 100,
      authRateLimitMax: 10,
      trustProxy: false,
    });
  });

  it('reads RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, AUTH_RATE_LIMIT_MAX and TRUST_PROXY', async () => {
    Object.assign(process.env, {
      RATE_LIMIT_WINDOW_MS: '30000',
      RATE_LIMIT_MAX: '2',
      AUTH_RATE_LIMIT_MAX: '3',
      TRUST_PROXY: '1',
    });
    const { config, createApp: freshCreateApp } = freshModules();
    expect(config).toMatchObject({ rateLimitWindowMs: 30000, rateLimitMax: 2, authRateLimitMax: 3, trustProxy: 1 });

    // An app built with NO rate-limit options picks those values up.
    const app = freshCreateApp({
      services: [registryEntry('auth', service.url, '/api/v1/auth')],
      verifyUrl: fakeAuth.verifyUrl,
      logWrite: () => {},
    });
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push((await request(app).post('/api/v1/auth/login').send({})).status);
    }
    expect(statuses).toEqual([201, 201, 201, 429]);
    expect((await request(app).post('/api/v1/auth/refresh').send({})).headers['ratelimit-policy']).toBe('3;w=30');
  });

  it('refuses TRUST_PROXY=true', () => {
    process.env.TRUST_PROXY = 'true';

    expect(() => freshModules()).toThrow(/TRUST_PROXY=true/);
  });
});
