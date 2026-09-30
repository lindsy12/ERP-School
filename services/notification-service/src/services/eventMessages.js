// Turns one RabbitMQ event into the notification people see. Pure functions: no I/O, easy to test.
// Payload fields per event are listed in docs/api-contracts/notification-service.md.

const fcfa = (amount) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(amount || 0))} FCFA`;
const reasonText = (reasons) => {
  const list = [].concat(reasons || []).filter(Boolean);
  return list.length ? `: ${list.join('; ')}` : '';
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const BUILDERS = {
  'academic.student.enrolled': (p) => ({
    audience: 'STAFF',
    title: 'Student enrolled',
    message: `Student #${p.studentId} enrolled in course #${p.courseId} (semester #${p.semesterId}).`,
    sourceKey: `enrolled-${p.studentId}-${p.courseId}-${p.semesterId}`,
  }),
  'academic.grade.published': (p) => ({
    audience: 'STAFF',
    title: 'Grade published',
    message: `Grade ${p.gradeLetter} published for student #${p.studentId} in course #${p.courseId}.`,
    sourceKey: `grade-${p.studentId}-${p.courseId}-${p.semesterId}-${p.publishedAt}`,
  }),
  'academic.student.at_risk_flagged': (p) => ({
    audience: 'STAFF',
    title: 'Student at risk',
    message: `Student #${p.studentId} was flagged at risk${reasonText(p.reasons ?? p.reason)}.`,
    sourceKey: p.flaggedAt ? `at-risk-${p.studentId}-${p.flaggedAt}` : null,
  }),
  'finance.invoice.created': (p) => ({
    audience: 'STAFF',
    title: 'Invoice created',
    message: `Invoice ${p.invoiceNumber || `#${p.invoiceId}`} of ${fcfa(p.amount)} issued to student #${p.studentId}.`,
    sourceKey: p.invoiceId ? `invoice-${p.invoiceId}` : null,
  }),
  'finance.payment.received': (p) => ({
    audience: 'STAFF',
    title: 'Payment received',
    message: `Receipt: ${fcfa(p.amount)} received for invoice #${p.invoiceId}${p.method ? ` by ${String(p.method).replace('_', ' ').toLowerCase()}` : ''}.`,
    sourceKey: p.paymentId ? `payment-${p.paymentId}` : null,
  }),
  'hr.leave.approved': (p) => ({
    audience: 'STAFF',
    title: 'Leave approved',
    message: `Leave request #${p.leaveId} for employee #${p.employeeId} was approved (${p.startDate} to ${p.endDate}).`,
    sourceKey: `leave-${p.leaveId}-approved`,
  }),
  'hr.leave.rejected': (p) => ({
    audience: 'STAFF',
    title: 'Leave rejected',
    message: `Leave request #${p.leaveId} for employee #${p.employeeId} was rejected${p.rejectionReason ? `: ${p.rejectionReason}` : ''}.`,
    sourceKey: `leave-${p.leaveId}-rejected`,
  }),
  'hr.payroll.processed': (p) => ({
    audience: 'ADMINS',
    title: 'Payroll processed',
    message: `Payroll for ${MONTHS[Number(p.month) - 1] || `month ${p.month}`} ${p.year} processed: ${p.employeeCount} employees, ${fcfa(p.totalNet)} net.`,
    sourceKey: p.payrollId ? `payroll-${p.payrollId}` : null,
  }),
};

const EVENT_TYPES = Object.keys(BUILDERS);

// Some publishers send the payload itself, others wrap it: { event, emittedAt, data }.
function unwrap(body) {
  return body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body.data : body || {};
}

// Returns the fields for notificationModel.create, or null for an event we don't show.
function buildNotification(eventType, body) {
  const build = BUILDERS[eventType];
  if (!build) return null;
  const payload = unwrap(body);
  const built = build(payload);
  return {
    ...built,
    eventType,
    tenantId: payload.tenantId || null,
    userId: payload.userId || null,
    sourceKey: built.sourceKey ? `${eventType}:${built.sourceKey}`.slice(0, 191) : null,
  };
}

module.exports = { buildNotification, EVENT_TYPES };
