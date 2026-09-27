const Joi = require('joi');

const STATUSES = ['available', 'assigned', 'maintenance', 'retired'];

const createAssetSchema = Joi.object({
  name: Joi.string().min(1).max(150).required(),
  category: Joi.string().min(1).max(100).required(),
  serialNumber: Joi.string().min(1).max(100).required(),
  status: Joi.string().valid(...STATUSES),
  assignedTo: Joi.number().integer().positive().allow(null),
  purchaseDate: Joi.date().iso().allow(null),
  value: Joi.number().min(0).allow(null),
});

const updateAssetSchema = Joi.object({
  name: Joi.string().min(1).max(150),
  category: Joi.string().min(1).max(100),
  serialNumber: Joi.string().min(1).max(100),
  status: Joi.string().valid(...STATUSES),
  assignedTo: Joi.number().integer().positive().allow(null),
  purchaseDate: Joi.date().iso().allow(null),
  value: Joi.number().min(0).allow(null),
}).min(1);

module.exports = { createAssetSchema, updateAssetSchema };
