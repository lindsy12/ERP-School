const request = require('supertest');
const app = require('../src/app');

describe('GET /health', () => {
  it('reports the service is up', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'auth' });
  });
});

describe('unknown routes', () => {
  it('return 404 with an error code', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('web pages', () => {
  it('serves the sign-in page at /auth/', async () => {
    const res = await request(app).get('/auth/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('js/app.js');
  });

  it('serves the shared session module other modules import', async () => {
    const res = await request(app).get('/auth/js/session.js');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });
});

describe('OpenAPI docs', () => {
  it('lists the auth endpoints', async () => {
    const res = await request(app).get('/api/v1/auth/openapi.json');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/api/v1/auth/login', '/api/v1/auth/me']),
    );
  });

  it('serves the Swagger UI', async () => {
    const res = await request(app).get('/api/v1/auth/docs/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
