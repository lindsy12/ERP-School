const request = require('supertest');
const dayjs = require('dayjs');
const app = require('../src/app');
const { resetDb, adminToken, staffToken } = require('./helpers');
const { Employee } = require('../src/models');

beforeEach(resetDb);

async function makeEmployee() {
  return Employee.create({
    matricule: 'EMP2025-001',
    firstName: 'Amara',
    lastName: 'Nkeng',
    email: 'amara.nkeng@example.com',
    department: 'Finance',
    role: 'Accountant',
    hireDate: '2024-01-01',
    baseSalary: 280000,
    status: 'active',
  });
}

// A Monday, so a 5-weekday request lands on a predictable business-day count.
const nextMonday = dayjs().day(1 + 7).format('YYYY-MM-DD');

describe('Leave tracking', () => {
  test('requests leave and computes business days excluding weekends', async () => {
    const employee = await makeEmployee();
    const startDate = nextMonday;
    const endDate = dayjs(nextMonday).add(4, 'day').format('YYYY-MM-DD'); // Mon-Fri

    const res = await request(app)
      .post('/api/v1/hr/leaves')
      .set('Authorization', `Bearer ${staffToken(employee.id)}`)
      .send({ type: 'annual', startDate, endDate, reason: 'Family trip' });

    expect(res.status).toBe(201);
    expect(res.body.days).toBe(5);
    expect(res.body.status).toBe('pending');
  });

  test('rejects a request exceeding the remaining annual balance', async () => {
    const employee = await makeEmployee();
    const startDate = nextMonday;
    const endDate = dayjs(nextMonday).add(30, 'day').format('YYYY-MM-DD'); // 23 business days, over the 20-day default

    const res = await request(app)
      .post('/api/v1/hr/leaves')
      .set('Authorization', `Bearer ${staffToken(employee.id)}`)
      .send({ type: 'annual', startDate, endDate });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Insufficient leave balance/);
  });

  test('rejects endDate before startDate', async () => {
    const employee = await makeEmployee();
    const res = await request(app)
      .post('/api/v1/hr/leaves')
      .set('Authorization', `Bearer ${staffToken(employee.id)}`)
      .send({ type: 'sick', startDate: '2026-01-10', endDate: '2026-01-05' });

    expect(res.status).toBe(400);
  });

  test('approving a leave deducts the balance and is idempotent against re-approval', async () => {
    const employee = await makeEmployee();
    const startDate = nextMonday;
    const endDate = dayjs(nextMonday).add(2, 'day').format('YYYY-MM-DD'); // Mon-Wed = 3 days

    const created = await request(app)
      .post('/api/v1/hr/leaves')
      .set('Authorization', `Bearer ${staffToken(employee.id)}`)
      .send({ type: 'annual', startDate, endDate });

    const approve = await request(app)
      .put(`/api/v1/hr/leaves/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('approved');

    const balance = await request(app)
      .get(`/api/v1/hr/leaves/balance/${employee.id}`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(balance.body.annual.used).toBe(3);
    expect(balance.body.annual.remaining).toBe(17);

    const reapprove = await request(app)
      .put(`/api/v1/hr/leaves/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(reapprove.status).toBe(409);
  });

  test('rejecting a leave requires a rejectionReason', async () => {
    const employee = await makeEmployee();
    const created = await request(app)
      .post('/api/v1/hr/leaves')
      .set('Authorization', `Bearer ${staffToken(employee.id)}`)
      .send({ type: 'sick', startDate: nextMonday, endDate: nextMonday });

    const missingReason = await request(app)
      .put(`/api/v1/hr/leaves/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(missingReason.status).toBe(400);

    const res = await request(app)
      .put(`/api/v1/hr/leaves/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ rejectionReason: 'Insufficient documentation' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });

  test('an employee cannot view another employee\'s leave balance', async () => {
    const employee = await makeEmployee();
    const res = await request(app)
      .get(`/api/v1/hr/leaves/balance/${employee.id}`)
      .set('Authorization', `Bearer ${staffToken(employee.id + 999)}`);
    expect(res.status).toBe(403);
  });
});
