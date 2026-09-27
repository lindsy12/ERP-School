const Joi = require('joi');

const generatePayrollSchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
});

const editPayrollItemSchema = Joi.object({
  bonus: Joi.number().min(0),
  deductions: Joi.number().min(0),
}).min(1);

module.exports = { generatePayrollSchema, editPayrollItemSchema };
