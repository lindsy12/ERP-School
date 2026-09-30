const notificationModel = require('../models/notification.model');
const HttpError = require('../utils/httpError');

const view = (n) => ({
  id: n.id,
  eventType: n.event_type,
  title: n.title,
  message: n.message,
  read: Boolean(n.read_at),
  createdAt: n.created_at,
});

// GET /api/v1/notifications?unread=true&limit=50
async function list(req, res) {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const rows = await notificationModel.listFor(req.user, { unreadOnly: req.query.unread === 'true', limit });
  res.json(rows.map(view));
}

// GET /api/v1/notifications/unread-count
async function unreadCount(req, res) {
  res.json({ unread: await notificationModel.countUnread(req.user) });
}

// PATCH /api/v1/notifications/:id/read
async function markRead(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'VALIDATION_ERROR', 'id must be a positive integer');
  if (!(await notificationModel.isVisible(req.user, id))) throw new HttpError(404, 'NOT_FOUND', 'Notification not found');
  await notificationModel.markRead(req.user.id, id);
  res.status(204).end();
}

// POST /api/v1/notifications/read-all
async function markAllRead(req, res) {
  res.json({ marked: await notificationModel.markAllRead(req.user) });
}

module.exports = { list, unreadCount, markRead, markAllRead };
