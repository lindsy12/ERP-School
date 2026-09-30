const express = require('express');
const controller = require('../controllers/asset.controller');
const validate = require('../middleware/validate');
const { createAssetSchema, updateAssetSchema } = require('../validators/asset.validator');
const { authenticate, requireRole, HR_MANAGER_ROLES } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', requireRole(...HR_MANAGER_ROLES), validate(createAssetSchema), controller.createAsset);
router.get('/', controller.listAssets);
router.put('/:id', requireRole(...HR_MANAGER_ROLES), validate(updateAssetSchema), controller.updateAsset);
router.delete('/:id', requireRole(...HR_MANAGER_ROLES), controller.deleteAsset);

module.exports = router;
