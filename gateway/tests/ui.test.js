const request = require('supertest');
const createApp = require('../src/app');
const { startEchoService, registryEntry, startFakeAuth } = require('./helpers');

let auth;
let hr;
let academic;
let fakeAuth;
let app;

beforeAll(async () => {
  auth = await startEchoService('auth');
  hr = await startEchoService('hr');
  academic = await startEchoService('academic');
  fakeAuth = await startFakeAuth();
  app = createApp({
    verifyUrl: fakeAuth.verifyUrl,
    services: [
      registryEntry('auth', auth.url, '/api/v1/auth', '/auth'),
      registryEntry('hr', hr.url, '/api/v1/hr', '/hr'),
      registryEntry('academic', academic.url, '/api/v1/academic', '/academic', { inlineScripts: true }),
    ],
    rateLimitMax: 3,
    logWrite: () => {},
  });
});

afterAll(async () => {
  await Promise.all([auth.close(), hr.close(), academic.close(), fakeAuth.close()]);
});

beforeEach(() => {
  fakeAuth.calls.length = 0;
});

describe('web pages (uiPrefix)', () => {
  it('GET under a uiPrefix is forwarded, full path, without a token and without calling /verify', async () => {
    const res = await request(app).get('/hr/js/app.js?v=2');

    expect(res.status).toBe(201);
    expect(res.body.service).toBe('hr');
    expect(res.body.url).toBe('/hr/js/app.js?v=2');
    expect(fakeAuth.calls).toHaveLength(0);
  });

  it('the bare prefix is forwarded too, so the service can redirect /hr to /hr/', async () => {
    const res = await request(app).get('/hr');

    expect(res.body.url).toBe('/hr');
  });

  it('forwards no identity, even forged, to page requests', async () => {
    const res = await request(app).get('/auth/').set('x-user-role', 'SUPER_ADMIN');

    expect(res.body.headers['x-user-role']).toBeUndefined();
  });

  it('only GET and HEAD: a POST under a uiPrefix is neither public nor routed', async () => {
    const withoutToken = await request(app).post('/hr/anything').send({});
    const withToken = await request(app).post('/hr/anything').set('Authorization', 'Bearer good-token').send({});

    expect(withoutToken.status).toBe(401);
    expect(withToken.status).toBe(404);
  });

  it('matches whole path segments only (/hrx is not a page of hr)', async () => {
    const res = await request(app).get('/hrx');

    expect(res.status).toBe(401);
  });

  it('page files do not use up the global rate limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await request(app).get(`/hr/file${i}.js`)).status).toBe(201);
    }
  });

  it('/ redirects to the sign-in page', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/');
  });
});

describe('favicon', () => {
  it('answers 204 without a token instead of 401', async () => {
    const res = await request(app).get('/favicon.ico');

    expect(res.status).toBe(204);
    expect(fakeAuth.calls).toHaveLength(0);
  });
});

describe('security headers on pages', () => {
  it('scripts only from our own origin, and no forced HTTPS upgrade (the site runs on plain HTTP)', async () => {
    const csp = (await request(app).get('/auth/')).headers['content-security-policy'];

    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('allows inline scripts only on pages of services marked inlineScripts', async () => {
    const academicCsp = (await request(app).get('/academic/exams.html')).headers['content-security-policy'];
    const hrCsp = (await request(app).get('/hr/')).headers['content-security-policy'];

    expect(academicCsp).toContain("script-src 'self' 'unsafe-inline'");
    expect(academicCsp).toContain("script-src-attr 'unsafe-inline'");
    expect(hrCsp).toContain("script-src 'self';");
    expect(hrCsp).toContain("script-src-attr 'none'");
  });
});
