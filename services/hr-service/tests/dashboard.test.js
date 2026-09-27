const request = require('supertest');
const app = require('../src/app');
const { resetDb, adminToken, TENANT_ID } = require('./helpers');
const { Employee } = require('../src/models');

beforeEach(resetDb);

describe('HR dashboard', () => {
  test('returns aggregate stats for managers', async () => {
    await Employee.create({
      tenantId: TENANT_ID,
      matricule: 'EMP2025-001', firstName: 'A', lastName: 'B', email: 'a.b@example.com',
      department: 'Academic', role: 'Staff', hireDate: '2024-01-01', baseSalary: 200000, status: 'active',
    });

    const res = await request(app)
      .get('/api/v1/hr/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.cards.totalActiveEmployees).toBe(1);
    expect(res.body.charts.employeesPerDepartment).toEqual([{ department: 'Academic', count: 1 }]);
    expect(res.body.charts.attendanceTrend).toHaveLength(7);
  });
});
