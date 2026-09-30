// Notifications page. Sign-in and API calls use the ERP's shared session (docs/gateway.md).
import { api, requireSession, signOut } from '/auth/js/session.js';
import { h, clear, badge, fmtDateTime, toast, busy, loading } from '/auth/js/ui.js';
import { ROLE_LABELS } from '/auth/js/me.js';

const $ = (id) => document.getElementById(id);
const API = '/api/v1/notifications';
let unreadOnly = false;

// Which module an event came from, shown as a small label.
const MODULE_OF = { academic: ['Academics', 'info'], finance: ['Finance', 'ok'], hr: ['HR', 'warn'] };

function showError(message) {
  $('msg').textContent = message || '';
  $('msg').hidden = !message;
}

function item(n) {
  const [label, kind] = MODULE_OF[n.eventType.split('.')[0]] || ['ERP', ''];
  const markBtn = n.read ? null : h('button', {
    class: 'btn ghost sm', type: 'button',
    onClick: (e) => busy(e.currentTarget, async () => {
      await api(`${API}/${n.id}/read`, { method: 'PATCH' });
      await load();
    }),
  }, 'Mark as read');
  return h('li', { class: `notif${n.read ? '' : ' unread'}` },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    h('div', { class: 'body' },
      h('strong', null, n.title, n.read ? null : h('span', { class: 'sr-only' }, ' (unread)')),
      h('p', null, n.message),
      h('div', { class: 'meta' }, badge(label, kind), h('span', null, fmtDateTime(n.createdAt)))),
    markBtn);
}

async function load() {
  const list = $('list');
  clear(list);
  list.appendChild(h('li', null, loading()));
  try {
    const [items, { unread }] = await Promise.all([
      api(`${API}${unreadOnly ? '?unread=true' : ''}`),
      api(`${API}/unread-count`),
    ]);
    showError('');
    $('summary').textContent = unread === 0 ? 'You are all caught up.' : `${unread} unread`;
    $('read-all').disabled = unread === 0;
    clear(list);
    if (items.length === 0) {
      list.appendChild(h('li', { class: 'empty' }, unreadOnly ? 'No unread notifications.' : 'No notifications yet. They appear here when grades are published, invoices issued, payments received, leave decided or payroll run.'));
      return;
    }
    items.forEach((n) => list.appendChild(item(n)));
  } catch (err) {
    if (err.status === 401) return;
    clear(list);
    showError(`Could not load notifications: ${err.message}`);
  }
}

function setFilter(unread) {
  unreadOnly = unread;
  $('show-all').setAttribute('aria-pressed', String(!unread));
  $('show-unread').setAttribute('aria-pressed', String(unread));
  load();
}

async function boot() {
  if (!requireSession()) return;
  window.addEventListener('auth:expired', () => requireSession());

  $('show-all').addEventListener('click', () => setFilter(false));
  $('show-unread').addEventListener('click', () => setFilter(true));
  $('refresh').addEventListener('click', load);
  $('read-all').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const { marked } = await api(`${API}/read-all`, { method: 'POST' });
    toast(`${marked} marked as read`, 'ok');
    await load();
  }));
  $('logout').addEventListener('click', async () => {
    await signOut();
    location.assign('/auth/');
  });

  try {
    const me = await api('/api/v1/auth/me');
    $('who').textContent = me.email;
    $('who-role').textContent = ROLE_LABELS[me.role] || me.role;
  } catch (err) { /* the list below reports connection problems */ }
  await load();
}

boot();
