const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');

const router = Router();

router.post('/login', authController.login);
router.get('/me', authenticate, authController.me);

module.exports = router;
