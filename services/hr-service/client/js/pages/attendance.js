import { api } from '../api.js';
import { h, clear, field, MONTHS, fmtTime, busy, loading } from '../ui.js';
import { getMe, NOT_LINKED } from '../state.js';

const LABEL = { present: 'Present', late: 'Late', absent: 'Absent', leave: 'Leave', weekend: '', upcoming: '' };

function calendar(data) {
  const first = new Date(`${data.calendar[0].date}T00:00:00`);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  return h('div', { class: 'cal', role: 'grid', 'aria-label': `${MONTHS[data.month - 1]} ${data.year} attendance` },
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div', { class: 'dow' }, d)),
    Array.from({ length: lead }).map(() => h('div', { class: 'day blank' })),
    data.calendar.map((d) => h('div', { class: `day ${d.status}`, role: 'gridcell' },
      h('b', null, Number(d.date.slice(8))), h('span', null, LABEL[d.status] || ''))));
}

function legend() {
  return h('ul', { class: 'legend', style: 'flex-direction:row;flex-wrap:wrap;gap:16px;margin-top:14px' },
    [['present', 'Present'], ['late', 'Late'], ['absent', 'Absent'], ['leave', 'Leave']].map(([k, l]) => h('li', null, h('span', { class: `dot ${k}` }), l)));
}

export default async function render(root) {
  const me = await getMe();
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Attendance'),
    h('p', { class: 'muted' }, me ? `${me.firstName} ${me.lastName} · ${me.matricule}` : 'Check in with your daily QR badge and review your month.'))));

  if (!me) { root.append(h('div', { class: 'notice warn' }, NOT_LINKED)); return; }

  const { image, qrData } = await api(`/attendance/qr/${me.id}`);
  const result = h('div', { role: 'status', 'aria-live': 'polite' });
  const calBox = h('div', null, loading());
  const now = new Date();
  const view = { month: now.getMonth() + 1, year: now.getFullYear() };

  const say = (kind, text) => { clear(result); result.append(h('div', { class: `notice ${kind}` }, text)); };
  const location = h('input', { name: 'location', value: 'Main entrance' });
  const manual = h('input', { name: 'manual', placeholder: 'employeeId:date:signature' });

  async function loadCalendar() {
    const data = await api(`/attendance/my?month=${view.month}&year=${view.year}`);
    clear(calBox);
    calBox.append(calendar(data), legend());
    title.textContent = `${MONTHS[view.month - 1]} ${view.year}`;
  }
  const shift = (delta) => {
    const d = new Date(view.year, view.month - 1 + delta, 1);
    view.month = d.getMonth() + 1; view.year = d.getFullYear();
    loadCalendar();
  };
  const title = h('h2', { style: 'margin:0', 'aria-live': 'polite' });

  const checkIn = h('button', { class: 'btn', type: 'button' }, 'Simulate QR scan · Check in');
  checkIn.addEventListener('click', () => busy(checkIn, async () => {
    try {
      const res = await api('/attendance/checkin', { method: 'POST', body: { qrData: manual.value.trim() || qrData, location: location.value } });
      say(res.attendance.status === 'late' ? 'warn' : 'ok', `${res.message} — marked ${res.attendance.status}.`);
      await loadCalendar();
    } catch (e) { say('bad', e.message); }
  }));
  const checkOut = h('button', { class: 'btn secondary', type: 'button' }, 'Check out');
  checkOut.addEventListener('click', () => busy(checkOut, async () => {
    try {
      const res = await api('/attendance/checkout', { method: 'POST', body: {} });
      const a = res.attendance;
      say('ok', `${res.message} — in at ${fmtTime(a.checkInTime)}, ${Math.floor(a.durationMinutes / 60)} h ${a.durationMinutes % 60} min worked.`);
      await loadCalendar();
    } catch (e) { say('bad', e.message); }
  }));

  root.append(h('div', { class: 'cols two' },
    h('section', { class: 'card' },
      h('h2', null, 'My badge'),
      h('div', { class: 'qr-box' },
        h('img', { src: image, alt: 'Your attendance QR code for today' }),
        h('p', { class: 'muted small', style: 'text-align:center;margin:8px 0 0' }, 'Signed for today only. Scan at the entrance — or use the buttons below to simulate the scanner.')),
      h('div', { style: 'display:grid;gap:12px;margin-top:8px' },
        field('Location', location),
        h('details', null, h('summary', { class: 'small' }, 'Paste scanned QR data (real scanner)'), field('QR data', manual, 'Leave empty to use your own badge above.')),
        h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, checkIn, checkOut),
        result)),
    h('section', { class: 'card' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px' },
        h('button', { class: 'btn secondary sm', type: 'button', 'aria-label': 'Previous month', onClick: () => shift(-1) }, '‹'),
        title,
        h('button', { class: 'btn secondary sm', type: 'button', 'aria-label': 'Next month', onClick: () => shift(1) }, '›')),
      calBox)));
  await loadCalendar();
}
