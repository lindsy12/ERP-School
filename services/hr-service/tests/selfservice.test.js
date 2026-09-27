const request = require('supertest');
const dayjs = require('dayjs');
const app = require('../src/app');
const { Employee, Payroll, PayrollItem } = require('../src/models');
const { resetDb, adminToken, staffToken } = require('./helpers');

beforeEach(resetDb);

const mk = (n, over = {}) => Employee.create({
  matricule: `EMP2026-00${n}`, firstName: `First${n}`, lastName: `Last${n}`, email: `e${n}@school.cm`,
  department: 'Academic', role: 'Lecturer', hireDate: '2026-01-05', baseSalary: 300000, ...over,
});

const nextMonday = () => {
  let d = dayjs().add(1, 'week');
  while (d.day() !== 1) d = d.add(1, 'day');
  return d.format('YYYY-MM-DD');
};

describe('Self-service endpoints', () => {
  test('GET /employees/me returns the caller\'s own record, 404 when unlinked', async () => {
    const emp = await mk(1);
    const ok = await request(app).get('/api/v1/hr/employees/me').set('Authorization', `Bearer ${staffToken(emp.id)}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(emp.id);

    const none = await request(app).get('/api/v1/hr/employees/me').set('Authorization', `Bearer ${staffToken(999)}`);
    expect(none.status).toBe(404);
  });

  test('GET /leaves/my lists only the caller\'s leaves', async () => {
    const a = await mk(1);
    const b = await mk(2);
    const start = nextMonday();
    await request(app).post('/api/v1/hr/leaves').set('Authorization', `Bearer ${staffToken(a.id)}`)
      .send({ type: 'sick', startDate: start, endDate: start });
    await request(app).post('/api/v1/hr/leaves').set('Authorization', `Bearer ${staffToken(b.id)}`)
      .send({ type: 'sick', startDate: start, endDate: start });

    const res = await request(app).get('/api/v1/hr/leaves/my').set('Authorization', `Bearer ${staffToken(a.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].employeeId).toBe(a.id);
  });

  test('GET /payroll/my returns only paid payslips for the caller', async () => {
    const emp = await mk(1);
    const paid = await Payroll.create({ month: 8, year: 2026, status: 'paid', paidAt: new Date() });
    const draft = await Payroll.create({ month: 9, year: 2026, status: 'draft' });
    const row = { employeeId: emp.id, baseSalary: 300000, cnpsEmployee: 12600, taxable: 287400, paye: 25000, net: 262400 };
    await PayrollItem.create({ payrollId: paid.id, ...row });
    await PayrollItem.create({ payrollId: draft.id, ...row });

    const res = await request(app).get('/api/v1/hr/payroll/my').set('Authorization', `Bearer ${staffToken(emp.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ month: 8, year: 2026 });
  });
});

describe('Impersonation protection', () => {
  test('a Staff user cannot file leave for another employee via body.employeeId', async () => {
    const me = await mk(1);
    const other = await mk(2);
    const start = nextMonday();
    const res = await request(app).post('/api/v1/hr/leaves').set('Authorization', `Bearer ${staffToken(me.id)}`)
      .send({ employeeId: other.id, type: 'sick', startDate: start, endDate: start });
    expect(res.status).toBe(201);
    expect(res.body.employeeId).toBe(me.id);
  });

  test('a manager may still file leave on behalf of an employee', async () => {
    const other = await mk(2);
    const start = nextMonday();
    const res = await request(app).post('/api/v1/hr/leaves').set('Authorization', `Bearer ${adminToken()}`)
      .send({ employeeId: other.id, type: 'sick', startDate: start, endDate: start });
    expect(res.status).toBe(201);
    expect(res.body.employeeId).toBe(other.id);
  });

  test('a Staff user cannot check out someone else via body.employeeId', async () => {
    const other = await mk(2);
    const res = await request(app).post('/api/v1/hr/attendance/checkout').set('Authorization', `Bearer ${staffToken(undefined)}`)
      .send({ employeeId: other.id });
    expect(res.status).toBe(400);
  });

  test('approvedBy is the authenticated approver, not a client-supplied id', async () => {
    const emp = await mk(1);
    const start = nextMonday();
    const leave = await request(app).post('/api/v1/hr/leaves').set('Authorization', `Bearer ${staffToken(emp.id)}`)
      .send({ type: 'sick', startDate: start, endDate: start });
    const res = await request(app).put(`/api/v1/hr/leaves/${leave.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken()}`).send({ approvedBy: 999 });
    expect(res.status).toBe(200);
    expect(res.body.approvedBy).toBe(1); // adminToken() has id 1
  });
});

describe('Asset validation', () => {
  test('rejects an unknown status and unknown fields are stripped', async () => {
    const bad = await request(app).post('/api/v1/hr/assets').set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Chair', category: 'Furniture', serialNumber: 'C-1', status: 'exploded' });
    expect(bad.status).toBe(400);

    const ok = await request(app).post('/api/v1/hr/assets').set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Chair', category: 'Furniture', serialNumber: 'C-1', id: 500 });
    expect(ok.status).toBe(201);
    expect(ok.body.id).not.toBe(500);
  });
});
