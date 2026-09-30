const { Router } = require('express');
const controller = require('../controllers/notifications.controller');

// Mounted at /api/v1/notifications (app.js), behind identify.
const router = Router();

router.get('/', controller.list);
router.get('/unread-count', controller.unreadCount);
router.post('/read-all', controller.markAllRead);
router.patch('/:id/read', controller.markRead);

module.exports = router;
