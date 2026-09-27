const Joi = require('joi');

const checkinSchema = Joi.object({
  qrData: Joi.string().required(),
  location: Joi.string().allow('', null),
});

const checkoutSchema = Joi.object({
  employeeId: Joi.number().integer().positive(), // optional: Staff derive it from their own token
});

module.exports = { checkinSchema, checkoutSchema };
