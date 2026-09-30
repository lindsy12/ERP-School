const { buildNotification, EVENT_TYPES } = require('../src/services/eventMessages');
const { rolesAudiences } = require('../src/services/audiences');

describe('buildNotification', () => {
  test('covers every event in the CLAUDE.md event map', () => {
    expect(EVENT_TYPES.sort()).toEqual([
      'academic.grade.published',
      'academic.student.at_risk_flagged',
      'academic.student.enrolled',
      'finance.invoice.created',
      'finance.payment.received',
      'hr.leave.approved',
      'hr.leave.rejected',
      'hr.payroll.processed',
    ]);
  });

  test('a payment becomes a receipt in FCFA for staff', () => {
    const n = buildNotification('finance.payment.received', { paymentId: 4, invoiceId: 9, amount: '75000.00', method: 'MOBILE_MONEY' });
    expect(n.audience).toBe('STAFF');
    expect(n.title).toBe('Payment received');
    expect(n.message).toMatch(/75.000 FCFA received for invoice #9 by mobile money/);
    expect(n.sourceKey).toBe('finance.payment.received:payment-4');
  });

  test('unwraps hr-service envelopes and keeps the tenant', () => {
    const n = buildNotification('hr.payroll.processed', {
      event: 'hr.payroll.processed',
      emittedAt: '2026-09-30T10:00:00Z',
      data: { tenantId: 't-1', payrollId: 2, month: 9, year: 2026, employeeCount: 12, totalNet: 3500000 },
    });
    expect(n.audience).toBe('ADMINS');
    expect(n.tenantId).toBe('t-1');
    expect(n.message).toMatch(/^Payroll for September 2026 processed: 12 employees/);
  });

  test('lists at-risk reasons', () => {
    const n = buildNotification('academic.student.at_risk_flagged', { studentId: 5, reasons: ['attendance below 75%', 'two failing grades'], flaggedAt: 'x' });
    expect(n.message).toBe('Student #5 was flagged at risk: attendance below 75%; two failing grades.');
  });

  test('ignores events it does not know', () => {
    expect(buildNotification('something.else', {})).toBeNull();
  });
});

describe('audiences', () => {
  test('admins see staff and admin notifications, staff only staff ones, students none', () => {
    expect(rolesAudiences('SUPER_ADMIN')).toEqual(['STAFF', 'ADMINS']);
    expect(rolesAudiences('STAFF')).toEqual(['STAFF']);
    expect(rolesAudiences('STUDENT')).toEqual([]);
  });
});
