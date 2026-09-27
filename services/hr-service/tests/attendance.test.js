const request = require('supertest');
const app = require('../src/app');
const { resetDb, adminToken, staffToken, TENANT_ID } = require('./helpers');
const { Employee } = require('../src/models');

beforeEach(resetDb);

async function makeEmployee() {
  return Employee.create({
    tenantId: TENANT_ID,
    matricule: 'EMP2025-001',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@example.com',
    department: 'HR',
    role: 'Officer',
    hireDate: '2024-01-01',
    baseSalary: 300000,
    status: 'active',
  });
}

describe('QR attendance', () => {
  test('generates a QR code for an employee', async () => {
    const employee = await makeEmployee();
    const res = await request(app)
      .get(`/api/v1/hr/attendance/qr/${employee.id}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.image).toMatch(/^data:image\/png;base64,/);
  });

  test('checks in successfully with a valid QR payload', async () => {
    const employee = await makeEmployee();
    const qrRes = await request(app)
      .get(`/api/v1/hr/attendance/qr/${employee.id}`)
      .set('Authorization', `Bearer ${await staffToken(employee.id)}`);
    expect(qrRes.status).toBe(200);

    // Re-derive the raw qrData the same way the service does, since the
    // response only carries the rendered image.
    const { generateQr } = require('../src/services/qr.service');
    const { qrData } = await generateQr(employee.id);

    const res = await request(app)
      .post('/api/v1/hr/attendance/checkin')
      .set('Authorization', `Bearer ${await staffToken(employee.id)}`)
      .send({ qrData, location: 'Main Gate' });

    expect(res.status).toBe(201);
    expect(res.body.attendance.status).toMatch(/present|late/);
  });

  test('rejects a tampered QR signature', async () => {
    const employee = await makeEmployee();
    const res = await request(app)
      .post('/api/v1/hr/attendance/checkin')
      .set('Authorization', `Bearer ${await staffToken(employee.id)}`)
      .send({ qrData: `${employee.id}:2025-01-01:deadbeef`, location: 'Main Gate' });

    expect(res.status).toBe(400);
  });

  test('prevents double check-in on the same day', async () => {
    const employee = await makeEmployee();
    const { generateQr } = require('../src/services/qr.service');
    const { qrData } = await generateQr(employee.id);
    const token = await staffToken(employee.id);

    await request(app).post('/api/v1/hr/attendance/checkin').set('Authorization', `Bearer ${token}`).send({ qrData });
    const res = await request(app)
      .post('/api/v1/hr/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ qrData });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Already checked in today/);
  });

  test('requires check-in before check-out', async () => {
    const employee = await makeEmployee();
    const res = await request(app)
      .post('/api/v1/hr/attendance/checkout')
      .set('Authorization', `Bearer ${await staffToken(employee.id)}`)
      .send({ employeeId: employee.id });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/must check in/);
  });

  test('computes duration on check-out', async () => {
    const employee = await makeEmployee();
    const { generateQr } = require('../src/services/qr.service');
    const { qrData } = await generateQr(employee.id);
    const token = await staffToken(employee.id);

    await request(app).post('/api/v1/hr/attendance/checkin').set('Authorization', `Bearer ${token}`).send({ qrData });
    const res = await request(app)
      .post('/api/v1/hr/attendance/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: employee.id });

    expect(res.status).toBe(200);
    expect(res.body.attendance.durationMinutes).toBeGreaterThanOrEqual(0);
  });
});
