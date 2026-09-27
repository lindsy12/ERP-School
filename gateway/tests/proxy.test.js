const request = require('supertest');
const createApp = require('../src/app');
const { startEchoService, deadServiceUrl, registryEntry } = require('./helpers');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let auth;
let notification;
let slow;
let app;

beforeAll(async () => {
  auth = await startEchoService('auth');
  notification = await startEchoService('notification');
  slow = await startEchoService('slow', { delayMs: 500 });
  app = createApp({
    services: [
      registryEntry('auth', auth.url, '/api/v1/auth'),
      registryEntry('notification', notification.url, '/api/v1/notifications'),
      registryEntry('hr', await deadServiceUrl(), '/api/v1/hr'),
      registryEntry('finance', slow.url, '/api/v1/finance'),
    ],
    proxyTimeoutMs: 200,
    logWrite: () => {},
  });
});

afterAll(async () => {
  await Promise.all([auth.close(), notification.close(), slow.close()]);
});

describe('routing', () => {
  it('forwards the FULL original path, prefix included, with the query string', async () => {
    const res = await request(app).get('/api/v1/auth/me?verbose=1');

    expect(res.status).toBe(201);
    expect(res.body.service).toBe('auth');
    expect(res.body.url).toBe('/api/v1/auth/me?verbose=1'); // not "/me?verbose=1"
  });

  it('forwards a POST JSON body intact (no express.json() eating it)', async () => {
    const body = { tenant_id: '11111111-1111-1111-1111-111111111111', email: 'a@b.co', password: 'x' };

    const res = await request(app).post('/api/v1/auth/login').send(body);

    expect(res.body.method).toBe('POST');
    expect(res.body.url).toBe('/api/v1/auth/login');
    expect(JSON.parse(res.body.body)).toEqual(body);
    expect(res.body.headers['content-type']).toMatch(/application\/json/);
  });

  it('sends each prefix to its own service', async () => {
    const res = await request(app).get('/api/v1/notifications/unread');

    expect(res.body.service).toBe('notification');
    expect(res.body.url).toBe('/api/v1/notifications/unread');
  });

  it('matches whole path segments only (/api/v1/authors is not auth)', async () => {
    const res = await request(app).get('/api/v1/authors');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('removes spoofed identity headers before forwarding', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('x-user-id', 'someone-else')
      .set('x-user-role', 'SUPER_ADMIN');

    expect(res.body.headers['x-user-id']).toBeUndefined();
    expect(res.body.headers['x-user-role']).toBeUndefined();
  });

  it('tells the service who the real client is', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.body.headers['x-forwarded-for']).toBeDefined();
  });
});

describe('failures', () => {
  it('returns 502 SERVICE_UNAVAILABLE when the service is down', async () => {
    const res = await request(app).post('/api/v1/hr/leave').send({ days: 2 });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: expect.stringContaining('hr') },
    });
  });

  it('returns 504 GATEWAY_TIMEOUT when the service is too slow', async () => {
    const res = await request(app).get('/api/v1/finance/invoices');

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('GATEWAY_TIMEOUT');
  });

  it('keeps serving after failures', async () => {
    await request(app).get('/api/v1/hr/employees');

    expect((await request(app).get('/api/v1/auth/me')).status).toBe(201);
  });
});

describe('correlation id', () => {
  it('generates one, forwards it, and returns it', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(res.body.headers['x-request-id']).toBe(res.headers['x-request-id']);
  });

  it("keeps the client's id when it is valid", async () => {
    const res = await request(app).get('/api/v1/auth/me').set('x-request-id', 'trace-abc_123');

    expect(res.headers['x-request-id']).toBe('trace-abc_123');
    expect(res.body.headers['x-request-id']).toBe('trace-abc_123');
  });

  it('replaces an id that could pollute the logs', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('x-request-id', 'bad id {"x":1}');

    expect(res.headers['x-request-id']).toMatch(UUID);
  });
});

describe('security headers and CORS', () => {
  it('adds helmet headers, also on proxied responses', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows the configured origin and exposes x-request-id to it', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Origin', 'http://allowed.test');

    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.test');
    expect(res.headers['access-control-expose-headers']).toContain('x-request-id');
  });

  it('does not allow other origins', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Origin', 'http://evil.test');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers the browser preflight itself', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://allowed.test')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.test');
  });
});
