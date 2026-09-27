const request = require('supertest');
const app = require('../src/app');
const { resetDb, adminToken, staffToken } = require('./helpers');
const { Employee } = require('../src/models');
const { calculateCnpsEmployee, calculateIRPP } = require('../src/services/payroll.service');

beforeEach(resetDb);

async function makeEmployee(overrides = {}) {
  return Employee.create({
    matricule: 'EMP2025-001',
    firstName: 'Paul',
    lastName: 'Biya-Junior',
    email: 'paul.junior@example.com',
    department: 'Administration',
    role: 'Clerk',
    hireDate: '2024-01-01',
    baseSalary: 400000,
    status: 'active',
    ...overrides,
  });
}

describe('Payroll generation and lifecycle', () => {
  test('generates payroll for all active employees with correct math', async () => {
    const employee = await makeEmployee();
    await makeEmployee({ email: 'inactive@example.com', matricule: 'EMP2025-002', status: 'inactive' });

    const res = await request(app)
      .post('/api/v1/hr/payroll/generate')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ month: 9, year: 2026 });

    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1); // inactive employee excluded

    const item = res.body.items[0];
    const expectedCnps = calculateCnpsEmployee(employee.baseSalary);
    const expectedPaye = calculateIRPP(employee.baseSalary - expectedCnps);
    expect(Number(item.cnpsEmployee)).toBeCloseTo(expectedCnps, 2);
    expect(Number(item.paye)).toBeCloseTo(expectedPaye, 2);
  });

  test('rejects duplicate payroll generation for the same month/year', async () => {
    await makeEmployee();
    await request(app).post('/api/v1/hr/payroll/generate').set('Authorization', `Bearer ${adminToken()}`).send({ month: 9, year: 2026 });
    const res = await request(app)
      .post('/api/v1/hr/payroll/generate')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ month: 9, year: 2026 });
    expect(res.status).toBe(409);
  });

  test('editing a draft payroll item recalculates net pay', async () => {
    await makeEmployee();
    const generated = await request(app).post('/api/v1/hr/payroll/generate').set('Authorization', `Bearer ${adminToken()}`).send({ month: 9, year: 2026 });
    const item = generated.body.items[0];

    const res = await request(app)
      .put(`/api/v1/hr/payroll/item/${item.id}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ bonus: 20000, deductions: 5000 });

    expect(res.status).toBe(200);
    const expectedNet = item.baseSalary - item.cnpsEmployee - item.paye + 20000 - 5000;
    expect(Number(res.body.net)).toBeCloseTo(expectedNet, 2);
  });

  test('payslip is not available until payroll is marked paid', async () => {
    const employee = await makeEmployee();
    const generated = await request(app).post('/api/v1/hr/payroll/generate').set('Authorization', `Bearer ${adminToken()}`).send({ month: 9, year: 2026 });
    const item = generated.body.items[0];

    const tooEarly = await request(app)
      .get(`/api/v1/hr/payroll/payslip/${item.id}`)
      .set('Authorization', `Bearer ${staffToken(employee.id)}`);
    expect(tooEarly.status).toBe(403);

    await request(app).put(`/api/v1/hr/payroll/${generated.body.payroll.id}/pay`).set('Authorization', `Bearer ${adminToken()}`);

    const afterPaid = await request(app)
      .get(`/api/v1/hr/payroll/payslip/${item.id}`)
      .set('Authorization', `Bearer ${staffToken(employee.id)}`);
    expect(afterPaid.status).toBe(200);
    expect(afterPaid.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('a different employee cannot download someone else\'s payslip', async () => {
    const employee = await makeEmployee();
    const generated = await request(app).post('/api/v1/hr/payroll/generate').set('Authorization', `Bearer ${adminToken()}`).send({ month: 9, year: 2026 });
    await request(app).put(`/api/v1/hr/payroll/${generated.body.payroll.id}/pay`).set('Authorization', `Bearer ${adminToken()}`);

    const item = generated.body.items[0];
    const res = await request(app)
      .get(`/api/v1/hr/payroll/payslip/${item.id}`)
      .set('Authorization', `Bearer ${staffToken(employee.id + 999)}`);
    expect(res.status).toBe(403);
  });

  test('a paid payroll is locked against further edits', async () => {
    await makeEmployee();
    const generated = await request(app).post('/api/v1/hr/payroll/generate').set('Authorization', `Bearer ${adminToken()}`).send({ month: 9, year: 2026 });
    await request(app).put(`/api/v1/hr/payroll/${generated.body.payroll.id}/pay`).set('Authorization', `Bearer ${adminToken()}`);

    const item = generated.body.items[0];
    const res = await request(app)
      .put(`/api/v1/hr/payroll/item/${item.id}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ bonus: 1000 });
    expect(res.status).toBe(409);
  });
});
