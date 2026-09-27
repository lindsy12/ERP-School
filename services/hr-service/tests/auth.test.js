const request = require('supertest');
const app = require('../src/app');
const { Employee } = require('../src/models');
const { resetDb, adminToken } = require('./helpers');

beforeEach(resetDb);

const employee = (over = {}) => ({
  matricule: 'EMP2026-001', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@school.cm',
  department: 'Academic', role: 'Lecturer', hireDate: '2026-01-05', baseSalary: 300000, ...over,
});

describe('Authentication', () => {
  test('rejects requests with neither a token nor gateway headers', async () => {
    const res = await request(app).get('/api/v1/hr/employees');
    expect(res.status).toBe(401);
  });

  test('rejects a token signed with the wrong secret', async () => {
    const res = await request(app).get('/api/v1/hr/employees').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });

  test('accepts gateway-forwarded x-user-id / x-user-role headers', async () => {
    const res = await request(app)
      .get('/api/v1/hr/employees')
      .set('x-user-id', '1').set('x-user-role', 'Admin');
    expect(res.status).toBe(200);
  });

  test('gateway headers with a non-manager role cannot reach manager endpoints', async () => {
    const res = await request(app)
      .get('/api/v1/hr/employees')
      .set('x-user-id', '9').set('x-user-role', 'Student');
    expect(res.status).toBe(403);
  });

  test('links a gateway user to their employee record via userId (self-service)', async () => {
    const emp = await Employee.create(employee({ userId: 42 }));
    const own = await request(app)
      .get(`/api/v1/hr/leaves/balance/${emp.id}`)
      .set('x-user-id', '42').set('x-user-role', 'Staff');
    expect(own.status).toBe(200);

    const other = await request(app)
      .get(`/api/v1/hr/leaves/balance/${emp.id + 1}`)
      .set('x-user-id', '42').set('x-user-role', 'Staff');
    expect(other.status).toBe(403);
  });

  test('a JWT still works alongside the header path', async () => {
    const res = await request(app).get('/api/v1/hr/employees').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });
});
