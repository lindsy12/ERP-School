// Routing and access rules through the app, with the database mocked (no MySQL needed).
jest.mock('../src/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../src/db');
const app = require('../src/app');

const as = (role, email = 'user@school.cm') => ({ 'x-user-id': 'user-1', 'x-user-role': role, 'x-user-email': email, 'x-tenant-id': 'tenant-1' });
const amara = { id: 3, first_name: 'Amara', last_name: 'Ngu', email: 'amara@school.cm' };

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

  describe('role views', () => {
    test('students cannot grade, list class grades or schedule exams', async () => {
      const grade = await request(app).post('/api/v1/academic/grades').set(as('STUDENT'))
        .send({ studentId: 3, courseId: 1, semesterId: 1, gradeLetter: 'A', gradePoints: 4 });
      const classGrades = await request(app).get('/api/v1/academic/grades?courseId=1&semesterId=1').set(as('STUDENT'));
      const exam = await request(app).post('/api/v1/academic/exams').set(as('STUDENT')).send({});
      expect([grade.status, classGrades.status, exam.status]).toEqual([403, 403, 403]);
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('staff grade but only read the exam timetable', async () => {
      const exam = await request(app).post('/api/v1/academic/exams').set(as('STAFF')).send({});
      expect(exam.status).toBe(403);
      pool.query.mockResolvedValueOnce([[]]);
      const list = await request(app).get('/api/v1/academic/exams').set(as('STAFF'));
      expect(list.status).toBe(200);
    });

    test('a student finds their own record by email', async () => {
      pool.query.mockResolvedValueOnce([[amara]]);
      const res = await request(app).get('/api/v1/academic/students/me').set(as('STUDENT', 'Amara@school.cm'));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 3, matric_number: 'STU000003' });
      expect(pool.query.mock.calls[0][1]).toEqual(['amara@school.cm']);
    });

    test('a student account with no record gets a clear 404', async () => {
      pool.query.mockResolvedValueOnce([[]]);
      const res = await request(app).get('/api/v1/academic/students/me').set(as('STUDENT'));
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/registrar/);
    });

    test("students cannot read another student's grades", async () => {
      pool.query.mockResolvedValueOnce([[amara]]);
      const res = await request(app).get('/api/v1/academic/students/4/grades').set(as('STUDENT', 'amara@school.cm'));
      expect(res.status).toBe(403);
    });

    test('students cannot enrol someone else', async () => {
      pool.query.mockResolvedValueOnce([[amara]]);
      const res = await request(app).post('/api/v1/academic/enrollments').set(as('STUDENT', 'amara@school.cm'))
        .send({ studentId: 4, courseId: 1, semesterId: 1 });
      expect(res.status).toBe(403);
    });

    test('students only see their published grades', async () => {
      pool.query
        .mockResolvedValueOnce([[amara]]) // who is calling
        .mockResolvedValueOnce([[amara]]) // student exists
        .mockResolvedValueOnce([[{ gpa: '4.00', total_credits: 4 }]]) // GPA
        .mockResolvedValueOnce([[
          { id: 1, grade_points: '4.00', published: 1 },
          { id: 2, grade_points: '2.00', published: 0 },
        ]]);
      const res = await request(app).get('/api/v1/academic/students/3/grades').set(as('STUDENT', 'amara@school.cm'));
      expect(res.status).toBe(200);
      expect(res.body.grades.map((g) => g.id)).toEqual([1]);
    });
  });
});
