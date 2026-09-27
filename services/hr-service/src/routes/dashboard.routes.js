const express = require('express');
const controller = require('../controllers/dashboard.controller');
const { authenticate, requireRole, HR_MANAGER_ROLES } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', authenticate, requireRole(...HR_MANAGER_ROLES), controller.getStats);

module.exports = router;
