import { api, isManager } from '../api.js';
import { h, clear, field, select, table, badge, fmtDate, MONTHS, modal, toast, busy, loading } from '../ui.js';
import { getMe, NOT_LINKED } from '../state.js';

const TYPES = [['annual', 'Annual'], ['sick', 'Sick'], ['maternity', 'Maternity'], ['paternity', 'Paternity']];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function businessDays(start, end) {
  let n = 0;
  for (let d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n += 1;
  }
  return n;
}

function balanceCard(b) {
  const pct = b.annual.total ? Math.round((b.annual.remaining / b.annual.total) * 100) : 0;
  return h('section', { class: 'card' },
    h('h2', null, `Leave balance ${b.year}`),
    h('div', { class: 'stat', style: 'box-shadow:none;margin-bottom:12px' },
      h('div', { class: 'label' }, 'Annual leave remaining'),
      h('div', { class: 'value num' }, `${b.annual.remaining} / ${b.annual.total} days`),
      h('div', { class: 'bar-track', style: 'margin-top:8px', role: 'progressbar', 'aria-valuenow': b.annual.remaining, 'aria-valuemin': 0, 'aria-valuemax': b.annual.total, 'aria-label': 'Annual leave remaining' },
        h('div', { class: 'bar-fill', style: `width:${pct}%` }))),
    h('dl', { class: 'kv' },
      h('dt', null, 'Sick leave used'), h('dd', null, `${b.sick.used} days`),
      h('dt', null, 'Maternity used'), h('dd', null, `${b.maternity.used} days`),
      h('dt', null, 'Paternity used'), h('dd', null, `${b.paternity.used} days`)),
    h('p', { class: 'muted small', style: 'margin-top:10px' }, 'Balances reset every 1 January.'));
}

function requestForm(onDone) {
  const type = select('type', TYPES, 'annual');
  const start = h('input', { name: 'startDate', type: 'date', required: true });
  const end = h('input', { name: 'endDate', type: 'date', required: true });
  const reason = h('textarea', { name: 'reason', maxlength: 500 });
  const attach = h('input', { name: 'attachmentUrl', type: 'url', placeholder: 'https://…' });
  const est = h('span', { class: 'hint', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Submit request');
  const update = () => {
    if (start.value && end.value) {
      est.textContent = end.value < start.value ? 'End date must be on or after the start date.' : `${businessDays(start.value, end.value)} working day(s), weekends excluded.`;
    }
  };
  start.addEventListener('change', () => { if (!end.value || end.value < start.value) end.value = start.value; update(); });
  end.addEventListener('change', update);

  const form = h('form', { class: 'form-grid' },
    field('Type', type),
    h('div', { class: 'field' }, h('label', { for: 'lv-start' }, 'From'), Object.assign(start, { id: 'lv-start' })),
    h('div', { class: 'field' }, h('label', { for: 'lv-end' }, 'To'), Object.assign(end, { id: 'lv-end' }), est),
    h('div', { class: 'full' }, field('Reason', reason)),
    h('div', { class: 'full' }, field('Attachment link', attach, 'Sick leave: link to your medical certificate.')),
    h('div', { class: 'full' }, submit));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (end.value < start.value) { toast('End date must be on or after the start date.', 'bad'); return; }
    busy(submit, async () => {
      const body = { type: type.value, startDate: start.value, endDate: end.value };
      if (reason.value.trim()) body.reason = reason.value.trim();
      if (attach.value.trim()) body.attachmentUrl = attach.value.trim();
      const leave = await api('/leaves', { method: 'POST', body });
      toast(`Request submitted — ${leave.days} working day(s), awaiting approval`, 'ok');
      form.reset(); est.textContent = '';
      onDone();
    });
  });
  return h('section', { class: 'card' }, h('h2', null, 'Request leave'), form);
}

function rejectDialog(leave, onDone) {
  const reason = h('textarea', { name: 'rejectionReason', required: true, maxlength: 300 });
  const go = h('button', { class: 'btn danger', type: 'button' }, 'Reject request');
  modal('Reject leave request', (close) => {
    go.addEventListener('click', () => {
      if (!reason.value.trim()) { toast('A rejection reason is required.', 'bad'); return; }
      busy(go, async () => {
        await api(`/leaves/${leave.id}/reject`, { method: 'PUT', body: { rejectionReason: reason.value.trim() } });
        toast('Leave rejected — the employee will be notified', 'ok');
        close(); onDone();
      });
    });
    return {
      body: h('div', null, h('p', null, `${leave.Employee.firstName} ${leave.Employee.lastName}: ${fmtDate(leave.startDate)} → ${fmtDate(leave.endDate)} (${leave.days} days)`), field('Reason (shown to the employee)', reason)),
      actions: [h('button', { class: 'btn secondary', type: 'button', onClick: close }, 'Cancel'), go],
    };
  });
}

async function managerSection(box) {
  const pending = h('div', null, loading());
  const cal = h('div', null, loading());
  const now = new Date();
  const view = { month: now.getMonth() + 1, year: now.getFullYear() };
  const calTitle = h('h2', { style: 'margin:0' });

  async function loadPending() {
    const leaves = await api('/leaves?status=pending');
    clear(pending);
    pending.append(table([
      { label: 'Employee', render: (l) => `${l.Employee.firstName} ${l.Employee.lastName}` },
      { label: 'Department', render: (l) => l.Employee.department },
      { label: 'Type', render: (l) => cap(l.type) },
      { label: 'Dates', render: (l) => `${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}` },
      { label: 'Days', align: 'right', key: 'days' },
      { label: 'Reason', render: (l) => l.reason || '—' },
      {
        label: '', actions: true, render: (l) => h('div', null,
          h('button', {
            class: 'btn sm',
            type: 'button',
            onClick: (ev) => busy(ev.currentTarget, async () => {
              await api(`/leaves/${l.id}/approve`, { method: 'PUT', body: {} });
              toast('Leave approved — the employee will be notified', 'ok');
              await Promise.all([loadPending(), loadCalendar()]);
            }),
          }, 'Approve'), ' ',
          h('button', { class: 'btn secondary sm', type: 'button', onClick: () => rejectDialog(l, () => loadPending()) }, 'Reject')),
      },
    ], leaves, { empty: 'No pending leave requests. 🎉' }));
  }

  async function loadCalendar() {
    const data = await api(`/leaves/calendar?month=${view.month}&year=${view.year}`);
    calTitle.textContent = `Who is away — ${MONTHS[view.month - 1]} ${view.year}`;
    clear(cal);
    cal.append(table([
      { label: 'Employee', render: (l) => `${l.Employee.firstName} ${l.Employee.lastName}` },
      { label: 'Department', render: (l) => l.Employee.department },
      { label: 'Type', render: (l) => cap(l.type) },
      { label: 'From', render: (l) => fmtDate(l.startDate) },
      { label: 'To', render: (l) => fmtDate(l.endDate) },
      { label: 'Days', align: 'right', key: 'days' },
    ], data.leaves, { empty: 'Nobody is on approved leave this month.' }));
  }
  const shift = (delta) => {
    const d = new Date(view.year, view.month - 1 + delta, 1);
    view.month = d.getMonth() + 1; view.year = d.getFullYear();
    loadCalendar();
  };

  box.append(
    h('h2', { style: 'margin:26px 0 12px' }, 'Pending approvals'), pending,
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin:26px 0 12px' },
      h('button', { class: 'btn secondary sm', type: 'button', 'aria-label': 'Previous month', onClick: () => shift(-1) }, '‹'), calTitle,
      h('button', { class: 'btn secondary sm', type: 'button', 'aria-label': 'Next month', onClick: () => shift(1) }, '›')),
    cal);
  await Promise.all([loadPending(), loadCalendar()]);
}

export default async function render(root) {
  const me = await getMe();
  const manager = isManager();
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Leave'),
    h('p', { class: 'muted' }, manager ? 'Request your own leave, approve requests and see who is away.' : 'Request leave and track your balance.'))));

  if (me) {
    const mine = h('div', null, loading());
    const balanceBox = h('div', null);
    async function loadMine() {
      const [leaves, bal] = await Promise.all([api('/leaves/my'), api(`/leaves/balance/${me.id}`)]);
      clear(mine); clear(balanceBox);
      balanceBox.append(balanceCard(bal));
      mine.append(table([
        { label: 'Type', render: (l) => cap(l.type) },
        { label: 'Dates', render: (l) => `${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}` },
        { label: 'Days', align: 'right', key: 'days' },
        { label: 'Status', render: (l) => badge(l.status) },
        { label: 'Note', render: (l) => l.rejectionReason || '—' },
      ], leaves, { empty: 'You have not requested any leave yet.' }));
    }
    root.append(h('div', { class: 'cols two' }, requestForm(loadMine), balanceBox),
      h('h2', { style: 'margin:26px 0 12px' }, 'My requests'), mine);
    await loadMine();
  } else if (!manager) {
    root.append(h('div', { class: 'notice warn' }, NOT_LINKED));
  }

  if (manager) await managerSection(root);
}
