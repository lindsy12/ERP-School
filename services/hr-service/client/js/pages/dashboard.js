import { api } from '../api.js';
import { h, svg, clear, fmtDate } from '../ui.js';

const stat = (label, value, sub) => h('div', { class: 'stat' },
  h('div', { class: 'label' }, label), h('div', { class: 'value num' }, value), sub ? h('div', { class: 'sub' }, sub) : null);

function departmentBars(rows) {
  if (!rows.length) return h('p', { class: 'muted' }, 'No active employees yet.');
  const max = Math.max(...rows.map((r) => r.count), 1);
  return h('div', { class: 'bars', role: 'list' }, rows.map((r) => h('div', { class: 'bar-row', role: 'listitem' },
    h('span', null, r.department),
    h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${(r.count / max) * 100}%` })),
    h('b', { class: 'num right' }, r.count))));
}

// Donut via stroke-dasharray on r=15.9155 circles (circumference = 100, so values are percentages).
function attendanceDonut(t) {
  const parts = [['present', t.present, 'Present'], ['late', t.late, 'Late'], ['leave', t.onLeave, 'On leave'], ['absent', t.absent, 'Absent']];
  const total = parts.reduce((s, p) => s + p[1], 0);
  let offset = 25; // start at 12 o'clock
  const segs = total === 0 ? [] : parts.filter((p) => p[1] > 0).map(([key, n]) => {
    const pct = (n / total) * 100;
    const el = svg('circle', { class: `seg-${key}`, cx: 21, cy: 21, r: 15.9155, 'stroke-dasharray': `${pct} ${100 - pct}`, 'stroke-dashoffset': offset });
    offset -= pct;
    return el;
  });
  const chart = svg('svg', { class: 'donut', viewBox: '0 0 42 42', role: 'img', 'aria-label': `Attendance today: ${parts.map((p) => `${p[2]} ${p[1]}`).join(', ')}` },
    svg('circle', { class: 'track', cx: 21, cy: 21, r: 15.9155 }), segs,
    svg('text', { x: 21, y: 22.5, 'text-anchor': 'middle', 'font-size': 7 }, String(total)),
    svg('text', { x: 21, y: 28, 'text-anchor': 'middle', 'font-size': 2.6, class: 'axis' }, 'employees'));
  return h('div', { class: 'donut-wrap' }, chart,
    h('ul', { class: 'legend' }, parts.map(([key, n, label]) => h('li', null, h('span', { class: `dot ${key}` }), `${label}: `, h('b', { class: 'num' }, n)))));
}

function trendLine(points) {
  const W = 440; const H = 190; const pad = { l: 30, r: 14, t: 16, b: 28 };
  const max = Math.max(...points.map((p) => p.present), 1);
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(points.length - 1, 1);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const el = svg('svg', { class: 'linechart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Employees present per day, last 7 days: ${points.map((p) => `${p.date} ${p.present}`).join(', ')}` });
  ticks.forEach((t) => {
    el.append(svg('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t) }), svg('text', { class: 'axis', x: pad.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
  });
  el.append(svg('polyline', { class: 'line', points: points.map((p, i) => `${x(i)},${y(p.present)}`).join(' ') }));
  points.forEach((p, i) => {
    el.append(
      svg('circle', { class: 'pt', cx: x(i), cy: y(p.present), r: 4 }, svg('title', null, `${fmtDate(p.date)}: ${p.present} present`)),
      svg('text', { class: 'val', x: x(i), y: y(p.present) - 9, 'text-anchor': 'middle' }, String(p.present)),
      svg('text', { class: 'axis', x: x(i), y: H - 8, 'text-anchor': 'middle' }, new Date(`${p.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })),
    );
  });
  return el;
}

export default async function render(root) {
  const started = performance.now();
  const s = await api('/dashboard/stats');
  const ms = Math.round(performance.now() - started);
  const c = s.cards;

  root.append(
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Workforce dashboard'), h('p', { class: 'muted' }, `${fmtDate(new Date().toISOString())} · loaded in ${ms} ms`)),
      h('button', { class: 'btn secondary', type: 'button', onClick: async () => { clear(root); await render(root); } }, 'Refresh')),
    h('div', { class: 'stat-grid' },
      stat('Active employees', c.totalActiveEmployees),
      stat('Present today', `${c.presentToday} / ${c.totalActiveEmployees}`, 'on time + late'),
      stat('On leave today', c.onLeaveToday),
      stat('Late arrivals', c.lateArrivalsToday, 'checked in after 08:30')),
    h('div', { class: 'cols three' },
      h('section', { class: 'card' }, h('h2', null, 'Employees per department'), departmentBars(s.charts.employeesPerDepartment)),
      h('section', { class: 'card' }, h('h2', null, 'Attendance today'), attendanceDonut(s.charts.attendanceToday)),
      h('section', { class: 'card' }, h('h2', null, 'Attendance — last 7 days'), trendLine(s.charts.attendanceTrend))));
}
