const { Asset, Employee } = require('../models');
const HttpError = require('../utils/httpError');

function sameTenant(record, req) {
  return record && record.tenantId === req.user.tenantId;
}

// An asset may only be assigned to an employee in the caller's own tenant —
// the FK alone doesn't check that, it just requires *some* employee to exist.
async function assertAssigneeInTenant(assignedTo, req) {
  if (!assignedTo) return;
  const employee = await Employee.findByPk(assignedTo);
  if (!sameTenant(employee, req)) throw new HttpError(400, 'VALIDATION_ERROR', 'assignedTo must be an employee in your own tenant');
}

async function createAsset(req, res, next) {
  try {
    await assertAssigneeInTenant(req.body.assignedTo, req);
    const asset = await Asset.create({ ...req.body, tenantId: req.user.tenantId });
    return res.status(201).json(asset);
  } catch (err) {
    return next(err);
  }
}

async function listAssets(req, res, next) {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = req.query.status;
    const assets = await Asset.findAll({ where, order: [['id', 'ASC']] });
    return res.json(assets);
  } catch (err) {
    return next(err);
  }
}

async function updateAsset(req, res, next) {
  try {
    const asset = await Asset.findByPk(req.params.id);
    if (!sameTenant(asset, req)) return next(new HttpError(404, 'NOT_FOUND', 'Asset not found'));
    await assertAssigneeInTenant(req.body.assignedTo, req);
    await asset.update(req.body);
    return res.json(asset);
  } catch (err) {
    return next(err);
  }
}

async function deleteAsset(req, res, next) {
  try {
    const asset = await Asset.findByPk(req.params.id);
    if (!sameTenant(asset, req)) return next(new HttpError(404, 'NOT_FOUND', 'Asset not found'));
    await asset.destroy();
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { createAsset, listAssets, updateAsset, deleteAsset };
