const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');

const router = Router();

router.post('/login', authController.login);
router.get('/me', authenticate, authController.me);
// Called by the gateway on every protected request to turn a token into user identity.
router.get('/verify', authenticate, authController.verify);

module.exports = router;
