// Small DOM toolkit. Everything that touches user data goes through textContent /
// createTextNode (never innerHTML), so API data can't inject markup — XSS mitigation.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

function applyAttrs(el, attrs) {
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v === false || v === null || v === undefined) return;
    if (k === 'class') el.setAttribute('class', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  });
}

function append(el, children) {
  children.flat(Infinity).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
export const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const BADGE = {
  active: 'ok', inactive: 'neutral', present: 'ok', late: 'warn', absent: 'bad', leave: 'info',
  pending: 'warn', approved: 'ok', rejected: 'bad', draft: 'warn', paid: 'ok',
  available: 'ok', assigned: 'info', maintenance: 'warn', retired: 'neutral',
};
export const badge = (status) => h('span', { class: `badge ${BADGE[status] || ''}` }, status);

export function toast(message, kind = '') {
  const box = document.getElementById('toasts');
  const t = h('div', { class: `toast ${kind}`, role: kind === 'bad' ? 'alert' : 'status' }, message);
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 6500 : 3800);
}

export function field(label, control, hint) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function select(name, options, current) {
  const s = h('select', { name });
  options.forEach((o) => {
    const [value, label] = Array.isArray(o) ? o : [o, o];
    const opt = h('option', { value }, label);
    if (String(value) === String(current)) opt.selected = true;
    s.appendChild(opt);
  });
  return s;
}

export function table(columns, rows, { empty = 'Nothing to show yet.', foot } = {}) {
  if (!rows.length) return h('div', { class: 'card empty' }, h('strong', null, empty));
  return h('div', { class: 'table-wrap' }, h('table', null,
    h('thead', null, h('tr', null, columns.map((c) => h('th', { class: c.align === 'right' ? 'right' : '' }, c.label)))),
    h('tbody', null, rows.map((row) => h('tr', null, columns.map((c) => {
      const v = c.render ? c.render(row) : row[c.key];
      return h('td', { class: [c.align === 'right' ? 'right num' : '', c.actions ? 'actions' : ''].join(' ').trim() }, v);
    })))),
    foot || null));
}

// Opens a <dialog>. build(close) returns { body, actions: [buttons] }; onClose fires however it closes.
export function modal(title, build, onClose) {
  const dlg = h('dialog', { 'aria-label': title });
  const close = () => dlg.close();
  const { body, actions = [] } = build(close);
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, title),
      h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Close', onClick: close }, '✕')),
    h('div', { class: 'dlg-body' }, body),
    actions.length ? h('div', { class: 'dlg-foot' }, actions) : null,
  );
  dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  return close;
}

export function confirmDialog(title, message, confirmLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    let answer = false;
    modal(title, (close) => ({
      body: h('p', null, message),
      actions: [
        h('button', { class: 'btn secondary', type: 'button', onClick: close }, 'Cancel'),
        h('button', { class: danger ? 'btn danger' : 'btn', type: 'button', onClick: () => { answer = true; close(); } }, confirmLabel),
      ],
    }), () => resolve(answer)); // Escape / ✕ / Cancel all resolve false
  });
}

// Runs an async action while disabling the button, surfacing errors as toasts.
export async function busy(button, fn) {
  button.disabled = true;
  try { return await fn(); } catch (err) { toast(err.message, 'bad'); return undefined; } finally { button.disabled = false; }
}

export const loading = (text = 'Loading…') => h('div', { class: 'loading', role: 'status' }, text);
