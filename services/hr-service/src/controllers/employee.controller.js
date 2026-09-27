const { Op } = require('sequelize');
const { Employee, AuditLog } = require('../models');
const { generateMatricule } = require('../utils/matricule');

async function createEmployee(req, res, next) {
  try {
    const existing = await Employee.findOne({ where: { email: req.body.email } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const matricule = await generateMatricule();
    const employee = await Employee.create({ ...req.body, matricule, status: 'active' });

    await AuditLog.create({
      action: 'employee.created',
      actorId: req.user?.id,
      actorRole: req.user?.role,
      targetType: 'Employee',
      targetId: employee.id,
      details: `Employee ${employee.matricule} created by ${req.user?.role || 'unknown'} #${req.user?.id ?? 'n/a'} on ${new Date().toISOString()}`,
    });

    return res.status(201).json(employee);
  } catch (err) {
    return next(err);
  }
}

async function listEmployees(req, res, next) {
  try {
    const { search, department, status, page, limit } = req.query;
    const where = {};
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
    if (!employee) return res.status(404).json({ error: 'No employee record linked to your account' });
    return res.json(employee);
  } catch (err) {
    return next(err);
  }
}

async function getEmployee(req, res, next) {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    return res.json(employee);
  } catch (err) {
    return next(err);
  }
}

async function updateEmployee(req, res, next) {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    await employee.update(req.body); // matricule is never in req.body: not part of updateEmployeeSchema
    return res.json(employee);
  } catch (err) {
    return next(err);
  }
}

async function deactivateEmployee(req, res, next) {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    await employee.update({ status: 'inactive' });
    await AuditLog.create({
      action: 'employee.deactivated',
      actorId: req.user?.id,
      actorRole: req.user?.role,
      targetType: 'Employee',
      targetId: employee.id,
      details: `Employee ${employee.matricule} deactivated by ${req.user?.role || 'unknown'} #${req.user?.id ?? 'n/a'}`,
    });

    return res.json({ message: 'Employee deactivated', employee });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getMe, createEmployee, listEmployees, getEmployee, updateEmployee, deactivateEmployee };
