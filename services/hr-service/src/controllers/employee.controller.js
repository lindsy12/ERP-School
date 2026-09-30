const { Op } = require('sequelize');
const { Employee, AuditLog } = require('../models');
const { generateMatricule } = require('../utils/matricule');
const HttpError = require('../utils/httpError');

async function createEmployee(req, res, next) {
  try {
    const { tenantId } = req.user;
    const existing = await Employee.findOne({ where: { tenantId, email: req.body.email } });
    if (existing) return next(new HttpError(409, 'CONFLICT', 'Email already in use'));

    const matricule = await generateMatricule(tenantId);
    const employee = await Employee.create({ ...req.body, tenantId, matricule, status: 'active' });

    await AuditLog.create({
      tenantId,
      action: 'employee.created',
      actorId: req.user.id,
      actorRole: req.user.role,
      targetType: 'Employee',
      targetId: employee.id,
      details: `Employee ${employee.matricule} created by ${req.user.role} #${req.user.id} on ${new Date().toISOString()}`,
    });

    return res.status(201).json(employee);
  } catch (err) {
    return next(err);
  }
}

async function listEmployees(req, res, next) {
  try {
    const { search, department, status, page, limit } = req.query;
    const where = { tenantId: req.user.tenantId };
    if (department) where.department = department;
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { matricule: { [Op.like]: `%${search}%` } },
      ];
    }

    const { rows, count } = await Employee.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['id', 'ASC']],
    });

    return res.json({ data: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) });
  } catch (err) {
    return next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const employee = req.user.employeeId ? await Employee.findByPk(req.user.employeeId) : null;
    if (!employee) return next(new HttpError(404, 'NOT_FOUND', 'No employee record linked to your account'));
    return res.json(employee);
  } catch (err) {
    return next(err);
  }
}

// A record from another tenant is reported as 404, same as a truly missing one —
// its existence must not leak across tenants.
function sameTenant(record, req) {
  return record && record.tenantId === req.user.tenantId;
}

async function getEmployee(req, res, next) {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!sameTenant(employee, req)) return next(new HttpError(404, 'NOT_FOUND', 'Employee not found'));
    return res.json(employee);
  } catch (err) {
    return next(err);
  }
}

async function updateEmployee(req, res, next) {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!sameTenant(employee, req)) return next(new HttpError(404, 'NOT_FOUND', 'Employee not found'));

    await employee.update(req.body); // matricule is never in req.body: not part of updateEmployeeSchema
    return res.json(employee);
  } catch (err) {
    return next(err);
  }
}

async function deactivateEmployee(req, res, next) {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!sameTenant(employee, req)) return next(new HttpError(404, 'NOT_FOUND', 'Employee not found'));

    await employee.update({ status: 'inactive' });
    await AuditLog.create({
      tenantId: req.user.tenantId,
      action: 'employee.deactivated',
      actorId: req.user.id,
      actorRole: req.user.role,
      targetType: 'Employee',
      targetId: employee.id,
      details: `Employee ${employee.matricule} deactivated by ${req.user.role} #${req.user.id}`,
    });

    return res.json({ message: 'Employee deactivated', employee });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getMe, createEmployee, listEmployees, getEmployee, updateEmployee, deactivateEmployee };
