// Routing and access rules through the app, with the database mocked (no MySQL needed).
jest.mock('../src/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../src/db');
const app = require('../src/app');

const as = (role) => ({ 'x-user-id': 'user-1', 'x-user-role': role, 'x-tenant-id': 'tenant-1' });

beforeEach(() => pool.query.mockReset());

describe('academic-service API', () => {
  test('GET /health reports the database', async () => {
    pool.query.mockResolvedValueOnce([[{ 1: 1 }]]);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('academic-service');
  });

  test('API calls without gateway identity headers are refused', async () => {
    const res = await request(app).get('/api/v1/academic/courses');
    expect(res.status).toBe(401);
  });

  test('routes live under /api/v1/academic', async () => {
    pool.query.mockResolvedValueOnce([[
      { id: 1, name: 'Fall 2026', start_date: new Date(2026, 8, 1), end_date: new Date(2026, 11, 20) },
    ]]);
    const res = await request(app).get('/api/v1/academic/semesters').set(as('STAFF'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: 'Fall 2026', start_date: '2026-09-01', end_date: '2026-12-20' }]);
  });

  test('students can read but not change academic records', async () => {
    const res = await request(app)
      .post('/api/v1/academic/semesters')
      .set(as('STUDENT'))
      .send({ name: 'X', startDate: '2026-01-01', endDate: '2026-02-01' });
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('the roster needs a semesterId', async () => {
    const res = await request(app).get('/api/v1/academic/courses/3/roster').set(as('ADMIN'));
    expect(res.status).toBe(400);
  });

  test('the roster adds matric numbers', async () => {
    pool.query.mockResolvedValueOnce([[{ student_id: 7, first_name: 'A', last_name: 'B', email: 'a@b.cm' }]]);
    const res = await request(app).get('/api/v1/academic/courses/3/roster?semesterId=2').set(as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body[0].matric_number).toBe('STU000007');
  });

  test('unknown API routes answer JSON 404', async () => {
    const res = await request(app).get('/api/v1/academic/nope').set(as('ADMIN'));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/);
  });

  test('web pages are served under /academic', async () => {
    const res = await request(app).get('/academic/exams.html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});
