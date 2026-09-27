const { Payroll, PayrollItem, Employee } = require('../models');
const { computePayrollItem, round2 } = require('../services/payroll.service');
const { streamPayslip } = require('../services/payslip.service');
const { publish } = require('../config/rabbitmq');
const { HR_MANAGER_ROLES } = require('../middleware/auth');

async function generatePayroll(req, res, next) {
  try {
    const { month, year } = req.body;

    const existing = await Payroll.findOne({ where: { month, year } });
    if (existing) {
      return res.status(409).json({ error: `Payroll for ${month}/${year} already exists` });
    }

    // NOTE: none of our leave types (annual/sick/maternity/paternity) are
    // configured as unpaid (see payrollConfig.unpaidLeaveTypes), so every
    // active employee is included. Extending that config list is enough to
    // change this behaviour later without touching this loop.
    const employees = await Employee.findAll({ where: { status: 'active' } });

    const payroll = await Payroll.create({ month, year, status: 'draft' });

    const items = await Promise.all(employees.map((employee) => {
      const computed = computePayrollItem(Number(employee.baseSalary));
      return PayrollItem.create({
        payrollId: payroll.id,
        employeeId: employee.id,
        ...computed,
      });
    }));

    return res.status(201).json({ payroll, items });
  } catch (err) {
    return next(err);
  }
}

async function getPayroll(req, res, next) {
  try {
    const { month, year } = req.query;
    const where = {};
    if (month) where.month = Number(month);
    if (year) where.year = Number(year);

    const payroll = await Payroll.findOne({ where });
    if (!payroll) return res.status(404).json({ error: 'Payroll not found for that period' });

    const items = await PayrollItem.findAll({
      where: { payrollId: payroll.id },
      include: [{ model: Employee, attributes: ['id', 'firstName', 'lastName', 'matricule', 'department'] }],
    });

    return res.json({ payroll, items });
  } catch (err) {
    return next(err);
  }
}

async function updatePayrollItem(req, res, next) {
  try {
    const item = await PayrollItem.findByPk(req.params.itemId, { include: [Payroll] });
    if (!item) return res.status(404).json({ error: 'Payroll item not found' });
    if (item.Payroll.status !== 'draft') {
      return res.status(409).json({ error: 'Payroll is already paid and locked for edits' });
    }

    const bonus = req.body.bonus ?? item.bonus;
    const deductions = req.body.deductions ?? item.deductions;
    const net = round2(Number(item.baseSalary) - Number(item.cnpsEmployee) - Number(item.paye) + Number(bonus) - Number(deductions));

    await item.update({ bonus, deductions, net });
    return res.json(item);
  } catch (err) {
    return next(err);
  }
}

async function payPayroll(req, res, next) {
  try {
    const payroll = await Payroll.findByPk(req.params.id, { include: [{ model: PayrollItem, as: 'items' }] });
    if (!payroll) return res.status(404).json({ error: 'Payroll not found' });
    if (payroll.status === 'paid') return res.status(409).json({ error: 'Payroll already marked as paid' });

    await payroll.update({ status: 'paid', paidAt: new Date() });

    const totalNet = payroll.items.reduce((sum, item) => sum + Number(item.net), 0);
    publish('hr.payroll.processed', {
      payrollId: payroll.id,
      month: payroll.month,
      year: payroll.year,
      employeeCount: payroll.items.length,
      totalNet: round2(totalNet),
    });

    return res.json({ message: 'Payroll marked as paid', payroll });
  } catch (err) {
    return next(err);
  }
}

// Paid payslips for the caller, newest first — lets an employee find their payroll item ids.
async function myPayslips(req, res, next) {
  try {
    if (!req.user.employeeId) return res.status(404).json({ error: 'No employee record linked to your account' });
    const items = await PayrollItem.findAll({
      where: { employeeId: req.user.employeeId },
      include: [{ model: Payroll, where: { status: 'paid' } }],
    });
    const payslips = items
      .map((i) => ({ id: i.id, month: i.Payroll.month, year: i.Payroll.year, net: i.net, paidAt: i.Payroll.paidAt }))
      .sort((a, b) => (b.year - a.year) || (b.month - a.month));
    return res.json(payslips);
  } catch (err) {
    return next(err);
  }
}

async function getPayslip(req, res, next) {
  try {
    const item = await PayrollItem.findByPk(req.params.itemId, {
      include: [Payroll, Employee],
    });
    if (!item) return res.status(404).json({ error: 'Payslip not found' });

    const isManager = HR_MANAGER_ROLES.includes(req.user.role);
    const isOwner = req.user.employeeId && Number(req.user.employeeId) === item.employeeId;
    if (!isManager && !isOwner) return res.status(403).json({ error: 'Insufficient permissions' });

    if (item.Payroll.status !== 'paid') {
      return res.status(403).json({ error: 'Payslip is only available once payroll is marked as paid' });
    }

    return streamPayslip(res, {
      employee: item.Employee,
      payrollItem: item,
      month: item.Payroll.month,
      year: item.Payroll.year,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { myPayslips, generatePayroll, getPayroll, updatePayrollItem, payPayroll, getPayslip };
