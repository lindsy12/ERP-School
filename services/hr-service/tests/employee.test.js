const request = require('supertest');
const app = require('../src/app');
const { resetDb, adminToken, roleToken } = require('./helpers');

beforeEach(resetDb);

const validEmployee = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  department: 'Academic',
  role: 'Lecturer',
  hireDate: '2024-01-15',
  baseSalary: 250000,
};

describe('Employee management', () => {
  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/hr/employees');
    expect(res.status).toBe(401);
  });

  test('rejects non-manager roles', async () => {
    const res = await request(app)
      .get('/api/v1/hr/employees')
      .set('Authorization', `Bearer ${roleToken('STAFF')}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('creates an employee with an auto-generated matricule', async () => {
    const res = await request(app)
      .post('/api/v1/hr/employees')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(validEmployee);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.matricule).toMatch(/^EMP\d{4}-\d{3}$/);
  });

  test('rejects duplicate emails', async () => {
    await request(app).post('/api/v1/hr/employees').set('Authorization', `Bearer ${adminToken()}`).send(validEmployee);
    const res = await request(app)
      .post('/api/v1/hr/employees')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(validEmployee);
    expect(res.status).toBe(409);
  });

  test('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/hr/employees')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ ...validEmployee, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('email');
  });

  test('lists and searches employees', async () => {
    await request(app).post('/api/v1/hr/employees').set('Authorization', `Bearer ${adminToken()}`).send(validEmployee);
    const res = await request(app)
      .get('/api/v1/hr/employees?search=John')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('updates an employee but ignores matricule changes', async () => {
    const created = await request(app).post('/api/v1/hr/employees').set('Authorization', `Bearer ${adminToken()}`).send(validEmployee);
    const res = await request(app)
      .put(`/api/v1/hr/employees/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ department: 'Finance', matricule: 'HACKED-001' });

    expect(res.status).toBe(200);
    expect(res.body.department).toBe('Finance');
    expect(res.body.matricule).toBe(created.body.matricule);
  });

  test('deactivates (soft-deletes) an employee', async () => {
    const created = await request(app).post('/api/v1/hr/employees').set('Authorization', `Bearer ${adminToken()}`).send(validEmployee);
    const res = await request(app)
      .delete(`/api/v1/hr/employees/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.employee.status).toBe('inactive');

    const stillListed = await request(app)
      .get('/api/v1/hr/employees?status=active')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(stillListed.body.data).toHaveLength(0);
  });

  test('an employee created under one tenant is invisible to another tenant\'s admin', async () => {
    const created = await request(app).post('/api/v1/hr/employees').set('Authorization', `Bearer ${adminToken()}`).send(validEmployee);

    const { OTHER_TENANT_ID } = require('./helpers'); // eslint-disable-line global-require
    const foreignGet = await request(app)
      .get(`/api/v1/hr/employees/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken(OTHER_TENANT_ID)}`);
    expect(foreignGet.status).toBe(404);

    const foreignList = await request(app)
      .get('/api/v1/hr/employees')
      .set('Authorization', `Bearer ${adminToken(OTHER_TENANT_ID)}`);
    expect(foreignList.body.data).toHaveLength(0);
  });
});
