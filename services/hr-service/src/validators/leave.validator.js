const Joi = require('joi');

const requestLeaveSchema = Joi.object({
  employeeId: Joi.number().integer().positive(), // optional: Staff derive it from their own token
  type: Joi.string().valid('annual', 'sick', 'maternity', 'paternity').required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  reason: Joi.string().allow('', null),
  attachmentUrl: Joi.string().uri().allow('', null),
});

const rejectLeaveSchema = Joi.object({
  rejectionReason: Joi.string().min(1).required(),
});

// No fields of its own: the approver is always the authenticated caller
// (see leave.controller.js), never something a client can supply. An empty
// schema still strips any body the client sends, silently.
const approveLeaveSchema = Joi.object({});

module.exports = { requestLeaveSchema, rejectLeaveSchema, approveLeaveSchema };
