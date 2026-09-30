const pool = require('../db/connection');
const { rolesAudiences } = require('../services/audiences');

// Notifications a user can see: their tenant's (or tenant-less) rows addressed to them or to an
// audience their role belongs to.
function visibleTo({ id, role, tenantId }) {
  const audiences = rolesAudiences(role);
  const clauses = ['(n.tenant_id IS NULL OR n.tenant_id = ?)'];
  const params = [tenantId];
  if (audiences.length) {
    clauses.push(`(n.user_id = ? OR (n.user_id IS NULL AND n.audience IN (${audiences.map(() => '?').join(', ')})))`);
    params.push(id, ...audiences);
  } else {
    clauses.push('n.user_id = ?');
    params.push(id);
  }
  return { where: clauses.join(' AND '), params };
}

// Returns the new row's id, or null when source_key was already stored (a redelivered event).
async function create({ tenantId = null, userId = null, audience, eventType, title, message, sourceKey = null }) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO notifications (tenant_id, user_id, audience, event_type, title, message, source_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, userId, audience, eventType, title, message, sourceKey]
  );
  return result.affectedRows ? result.insertId : null;
}

async function listFor(user, { unreadOnly = false, limit = 50 } = {}) {
  const { where, params } = visibleTo(user);
  const [rows] = await pool.query(
    `SELECT n.id, n.event_type, n.title, n.message, n.created_at, r.read_at
       FROM notifications n
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
      WHERE ${where} ${unreadOnly ? 'AND r.read_at IS NULL' : ''}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ?`,
    [user.id, ...params, limit]
  );
  return rows;
}

async function countUnread(user) {
  const { where, params } = visibleTo(user);
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS unread
       FROM notifications n
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
      WHERE ${where} AND r.read_at IS NULL`,
    [user.id, ...params]
  );
  return Number(row.unread);
}

async function isVisible(user, notificationId) {
  const { where, params } = visibleTo(user);
  const [rows] = await pool.query(`SELECT n.id FROM notifications n WHERE n.id = ? AND ${where}`, [notificationId, ...params]);
  return rows.length > 0;
}

async function markRead(userId, notificationId) {
  await pool.query('INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)', [notificationId, userId]);
}

async function markAllRead(user) {
  const { where, params } = visibleTo(user);
  const [result] = await pool.query(
    `INSERT IGNORE INTO notification_reads (notification_id, user_id)
     SELECT n.id, ? FROM notifications n WHERE ${where}`,
    [user.id, ...params]
  );
  return result.affectedRows;
}

module.exports = { create, listFor, countUnread, isVisible, markRead, markAllRead };
