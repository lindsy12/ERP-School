const request = require('supertest');
const app = require('../src/app');
const { Employee } = require('../src/models');
const { resetDb, adminToken, TENANT_ID, OTHER_TENANT_ID } = require('./helpers');

beforeEach(resetDb);

const STAFF_USER_ID = '33333333-3333-4333-8333-333333333333';

const employee = (over = {}) => ({
  tenantId: TENANT_ID,
  matricule: 'EMP2026-001', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@school.cm',
  department: 'Academic', role: 'Lecturer', hireDate: '2026-01-05', baseSalary: 300000, ...over,
});

describe('Authentication', () => {
  test('rejects requests with neither a token nor gateway headers', async () => {
    const res = await request(app).get('/api/v1/hr/employees');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('rejects a token signed with the wrong secret', async () => {
    const res = await request(app).get('/api/v1/hr/employees').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('accepts gateway-forwarded x-user-id / x-user-role / x-tenant-id headers', async () => {
    const res = await request(app)
      .get('/api/v1/hr/employees')
      .set('x-user-id', '11111111-1111-4111-8111-000000000001').set('x-user-role', 'ADMIN').set('x-tenant-id', TENANT_ID);
    expect(res.status).toBe(200);
  });

  test('gateway headers with a non-manager role cannot reach manager endpoints', async () => {
    const res = await request(app)
      .get('/api/v1/hr/employees')
      .set('x-user-id', '11111111-1111-4111-8111-000000000009').set('x-user-role', 'STUDENT').set('x-tenant-id', TENANT_ID);
    expect(res.status).toBe(403);
  });

  test('links a gateway user to their employee record via userId (self-service)', async () => {
    const emp = await Employee.create(employee({ userId: STAFF_USER_ID }));
    const own = await request(app)
      .get(`/api/v1/hr/leaves/balance/${emp.id}`)
      .set('x-user-id', STAFF_USER_ID).set('x-user-role', 'STAFF').set('x-tenant-id', TENANT_ID);
    expect(own.status).toBe(200);

    const other = await request(app)
      .get(`/api/v1/hr/leaves/balance/${emp.id + 1}`)
      .set('x-user-id', STAFF_USER_ID).set('x-user-role', 'STAFF').set('x-tenant-id', TENANT_ID);
    expect(other.status).toBe(403);
  });

  test('a JWT still works alongside the header path', async () => {
    const res = await request(app).get('/api/v1/hr/employees').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });

  test('the same userId in a different tenant is not linked (no cross-tenant self-service)', async () => {
    const emp = await Employee.create(employee({ userId: STAFF_USER_ID }));
    const res = await request(app)
      .get(`/api/v1/hr/leaves/balance/${emp.id}`)
      .set('x-user-id', STAFF_USER_ID).set('x-user-role', 'STAFF').set('x-tenant-id', OTHER_TENANT_ID);
    // Not their tenant, so employeeId never resolves, and they aren't a manager either.
    expect(res.status).toBe(403);
  });
});
