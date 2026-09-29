const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const usersRoutes = require('./users.routes');

const router = Router();

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.post('/change-password', authenticate, authController.changePassword);
router.get('/me', authenticate, authController.me);
// Called by the gateway on every protected request to turn a token into user identity.
router.get('/verify', authenticate, authController.verify);

router.use('/users', usersRoutes);

module.exports = router;
