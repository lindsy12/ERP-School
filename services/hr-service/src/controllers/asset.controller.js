const { Asset } = require('../models');

async function createAsset(req, res, next) {
  try {
    const asset = await Asset.create(req.body);
    return res.status(201).json(asset);
  } catch (err) {
    return next(err);
  }
}

async function listAssets(req, res, next) {
  try {
    const where = {};
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
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    await asset.update(req.body);
    return res.json(asset);
  } catch (err) {
    return next(err);
  }
}

async function deleteAsset(req, res, next) {
  try {
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    await asset.destroy();
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { createAsset, listAssets, updateAsset, deleteAsset };
