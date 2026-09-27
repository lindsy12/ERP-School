const request = require('supertest');
const app = require('../src/app');
const { resetDb } = require('./helpers');

beforeEach(resetDb);

describe('Health check', () => {
  test('reports ok when the database is reachable', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ service: 'hr-service', status: 'ok', db: 'up' });
  });

  test('404s on an unknown route', async () => {
    const res = await request(app).get('/api/v1/hr/does-not-exist');
    expect(res.status).toBe(404);
  });
});
