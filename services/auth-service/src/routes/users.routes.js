// Account management, mounted at /api/v1/auth/users. ADMIN and SUPER_ADMIN only; which accounts
// each of them may change is decided in services/users.service.js.
const { Router } = require('express');
const usersController = require('../controllers/users.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');

const router = Router();

router.use(authenticate, requireRole('ADMIN', 'SUPER_ADMIN'));

router.post('/', usersController.create);
router.get('/', usersController.list);
router.get('/:id', usersController.get);
router.patch('/:id', usersController.update);
router.post('/:id/reset-password', usersController.resetPassword);
router.post('/:id/unlock', usersController.unlock);

module.exports = router;
