const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');

const router = Router();

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.post('/users/:id/unlock', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), authController.unlockUser);
router.get('/me', authenticate, authController.me);
// Called by the gateway on every protected request to turn a token into user identity.
router.get('/verify', authenticate, authController.verify);

module.exports = router;
