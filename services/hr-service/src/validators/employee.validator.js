const Joi = require('joi');

const createEmployeeSchema = Joi.object({
  firstName: Joi.string().min(1).max(100).required(),
  lastName: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().max(30).allow('', null),
  department: Joi.string().min(1).max(100).required(),
  role: Joi.string().min(1).max(100).required(),
  hireDate: Joi.date().iso().required(),
  baseSalary: Joi.number().min(0).required(),
  // auth-service's users.id (UUID) — links this employee to their login account.
  userId: Joi.string().guid().allow(null),
});

const updateEmployeeSchema = Joi.object({
  firstName: Joi.string().min(1).max(100),
  lastName: Joi.string().min(1).max(100),
  email: Joi.string().email(),
  phone: Joi.string().max(30).allow('', null),
  department: Joi.string().min(1).max(100),
  role: Joi.string().min(1).max(100),
  hireDate: Joi.date().iso(),
  baseSalary: Joi.number().min(0),
  status: Joi.string().valid('active', 'inactive'),
  userId: Joi.string().guid().allow(null),
}).min(1);

const listEmployeesQuerySchema = Joi.object({
  search: Joi.string().allow(''),
  department: Joi.string().allow(''),
  status: Joi.string().valid('active', 'inactive'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

module.exports = { createEmployeeSchema, updateEmployeeSchema, listEmployeesQuerySchema };
