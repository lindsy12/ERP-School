const dayjs = require('dayjs');
const { Op } = require('sequelize');
const { Leave, LeaveBalance, Employee } = require('../models');
const { countBusinessDays } = require('../utils/businessDays');
const { publish } = require('../config/rabbitmq');
const { HR_MANAGER_ROLES } = require('../middleware/auth');

async function getOrCreateBalance(employeeId, year) {
  const [balance] = await LeaveBalance.findOrCreate({
    where: { employeeId, year },
    defaults: { employeeId, year },
  });
  return balance;
}

async function requestLeave(req, res, next) {
  try {
    // Only managers may file on behalf of someone else; everyone else is pinned to their own record.
    const isManager = HR_MANAGER_ROLES.includes(req.user.role);
    const employeeId = isManager ? (req.body.employeeId || req.user.employeeId) : req.user.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'No employee record linked to your account' });

    const { type, startDate, endDate, reason, attachmentUrl } = req.body;
    const days = countBusinessDays(startDate, endDate);
    const year = dayjs(startDate).year();

    if (type === 'annual') {
      const balance = await getOrCreateBalance(employeeId, year);
      const remaining = balance.annualTotal - balance.annualUsed;
      if (days > remaining) {
        return res.status(400).json({ error: `Insufficient leave balance: ${remaining} day(s) remaining, ${days} requested` });
      }
    }

    const leave = await Leave.create({
      employeeId, type, startDate, endDate, days, reason, attachmentUrl, status: 'pending',
    });

    return res.status(201).json(leave);
  } catch (err) {
    return next(err);
  }
}

async function listLeaves(req, res, next) {
  try {
    const { status, employeeId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const leaves = await Leave.findAll({
      where,
      include: [{ model: Employee, attributes: ['id', 'firstName', 'lastName', 'department', 'matricule'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.json(leaves);
  } catch (err) {
    return next(err);
  }
}

async function myLeaves(req, res, next) {
  try {
    if (!req.user.employeeId) return res.status(404).json({ error: 'No employee record linked to your account' });
    const leaves = await Leave.findAll({ where: { employeeId: req.user.employeeId }, order: [['createdAt', 'DESC']] });
    return res.json(leaves);
  } catch (err) {
    return next(err);
  }
}

async function approveLeave(req, res, next) {
  try {
    const leave = await Leave.findByPk(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(409).json({ error: `Leave already ${leave.status}` });

    const approvedBy = req.user.id; // never trust a client-supplied approver
    await leave.update({ status: 'approved', approvedBy, approvedAt: new Date() });

    const year = dayjs(leave.startDate).year();
    const balance = await getOrCreateBalance(leave.employeeId, year);
    const usedField = { annual: 'annualUsed', sick: 'sickUsed', maternity: 'maternityUsed', paternity: 'paternityUsed' }[leave.type];
    await balance.update({ [usedField]: balance[usedField] + leave.days });

    publish('hr.leave.approved', {
      leaveId: leave.id,
      employeeId: leave.employeeId,
      type: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      message: `Your leave from ${leave.startDate} to ${leave.endDate} is approved`,
    });

    return res.json(leave);
  } catch (err) {
    return next(err);
  }
}

async function rejectLeave(req, res, next) {
  try {
    const leave = await Leave.findByPk(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(409).json({ error: `Leave already ${leave.status}` });

    await leave.update({ status: 'rejected', rejectionReason: req.body.rejectionReason });

    publish('hr.leave.rejected', {
      leaveId: leave.id,
      employeeId: leave.employeeId,
      rejectionReason: leave.rejectionReason,
      message: `Your leave from ${leave.startDate} to ${leave.endDate} was rejected: ${leave.rejectionReason}`,
    });

    return res.json(leave);
  } catch (err) {
    return next(err);
  }
}

async function getBalance(req, res, next) {
  try {
    const { employeeId } = req.params;
    const year = Number(req.query.year) || dayjs().year();
    const balance = await getOrCreateBalance(employeeId, year);

    return res.json({
      employeeId: Number(employeeId),
      year,
      annual: { total: balance.annualTotal, used: balance.annualUsed, remaining: balance.annualTotal - balance.annualUsed },
      sick: { used: balance.sickUsed },
      maternity: { used: balance.maternityUsed },
      paternity: { used: balance.paternityUsed },
    });
  } catch (err) {
    return next(err);
  }
}

async function leaveCalendar(req, res, next) {
  try {
    const month = Number(req.query.month) || dayjs().month() + 1;
    const year = Number(req.query.year) || dayjs().year();
    const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
    const end = start.endOf('month');

    const leaves = await Leave.findAll({
      where: {
        status: 'approved',
        startDate: { [Op.lte]: end.format('YYYY-MM-DD') },
        endDate: { [Op.gte]: start.format('YYYY-MM-DD') },
      },
      include: [{ model: Employee, attributes: ['id', 'firstName', 'lastName', 'department'] }],
    });

    return res.json({ month, year, leaves });
  } catch (err) {
    return next(err);
  }
}

module.exports = { requestLeave, myLeaves, listLeaves, approveLeave, rejectLeave, getBalance, leaveCalendar };
