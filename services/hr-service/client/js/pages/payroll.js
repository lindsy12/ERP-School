import { api, download, isManager } from '../api.js';
import { h, clear, field, select, table, badge, fcfa, fmtDate, MONTHS, modal, confirmDialog, toast, busy, loading } from '../ui.js';
import { getMe } from '../state.js';

const num = (v) => Number(v || 0);

async function myPayslips(box) {
  let slips = [];
  try { slips = await api('/payroll/my'); } catch (e) { if (e.status !== 404) throw e; return; }
  box.append(
    h('h2', { style: 'margin:0 0 12px' }, 'My payslips'),
    table([
      { label: 'Period', render: (s) => `${MONTHS[s.month - 1]} ${s.year}` },
      { label: 'Net pay', align: 'right', render: (s) => fcfa(s.net) },
      { label: 'Paid on', render: (s) => fmtDate(s.paidAt) },
      {
        label: '', actions: true, render: (s) => h('button', {
          class: 'btn secondary sm',
          type: 'button',
          onClick: (ev) => busy(ev.currentTarget, () => download(`/payroll/payslip/${s.id}`, `payslip-${s.year}-${String(s.month).padStart(2, '0')}.pdf`)),
        }, 'Download PDF'),
      },
    ], slips, { empty: 'No payslips yet — they appear here once payroll for a month is paid.' }));
}

function editItem(item, onSaved) {
  const bonus = h('input', { name: 'bonus', type: 'number', min: 0, step: '1', value: num(item.bonus) });
  const deductions = h('input', { name: 'deductions', type: 'number', min: 0, step: '1', value: num(item.deductions) });
  const preview = h('p', { class: 'muted', 'aria-live': 'polite' });
  const save = h('button', { class: 'btn', type: 'button' }, 'Save');
  const calc = () => { preview.textContent = `New net pay: ${fcfa(num(item.baseSalary) - num(item.cnpsEmployee) - num(item.paye) + num(bonus.value) - num(deductions.value))}`; };
  bonus.addEventListener('input', calc); deductions.addEventListener('input', calc); calc();
  modal(`Adjust pay — ${item.Employee.firstName} ${item.Employee.lastName}`, (close) => {
    save.addEventListener('click', () => busy(save, async () => {
      await api(`/payroll/item/${item.id}`, { method: 'PUT', body: { bonus: num(bonus.value), deductions: num(deductions.value) } });
      toast('Payroll line updated', 'ok'); close(); onSaved();
    }));
    return {
      body: h('div', { class: 'form-grid' }, field('Bonus (FCFA)', bonus), field('Other deductions (FCFA)', deductions),
        h('div', { class: 'full' }, preview, h('p', { class: 'muted small' }, 'CNPS and PAYE stay as calculated from base salary; only net pay changes.'))),
      actions: [h('button', { class: 'btn secondary', type: 'button', onClick: close }, 'Cancel'), save],
    };
  });
}

async function managerSection(box) {
  const now = new Date();
  const month = select('month', MONTHS.map((m, i) => [i + 1, m]), now.getMonth() + 1);
  const year = h('input', { name: 'year', type: 'number', min: 2000, max: 2100, value: now.getFullYear() });
  const out = h('div', null);

  async function load() {
    clear(out); out.append(loading());
    let data;
    try {
      data = await api(`/payroll?month=${month.value}&year=${year.value}`);
    } catch (e) {
      clear(out);
      if (e.status !== 404) throw e;
      out.append(h('div', { class: 'card empty' }, h('strong', null, `No payroll for ${MONTHS[month.value - 1]} ${year.value} yet`),
        h('p', null, 'Generate a draft for all active employees, review it, then mark it as paid.')));
      return;
    }
    const { payroll, items } = data;
    const paid = payroll.status === 'paid';
    const sum = (k) => items.reduce((s, i) => s + num(i[k]), 0);
    clear(out);
    out.append(
      h('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px' },
        h('h2', { style: 'margin:0' }, `${MONTHS[payroll.month - 1]} ${payroll.year}`), badge(payroll.status),
        paid ? h('span', { class: 'muted' }, `Paid ${fmtDate(payroll.paidAt)} · locked`) : h('span', { class: 'muted' }, 'Draft — review and adjust before paying'),
        paid ? null : h('button', {
          class: 'btn',
          style: 'margin-left:auto',
          type: 'button',
          onClick: async (ev) => {
            const btn = ev.currentTarget;
            if (!(await confirmDialog('Mark payroll as paid', `This finalises ${MONTHS[payroll.month - 1]} ${payroll.year} for ${items.length} employees (net ${fcfa(sum('net'))}), notifies Finance and locks the payroll from further edits.`, 'Mark as paid'))) return;
            busy(btn, async () => { await api(`/payroll/${payroll.id}/pay`, { method: 'PUT' }); toast('Payroll marked as paid', 'ok'); await load(); });
          },
        }, 'Mark as paid')),
      table([
        { label: 'Employee', render: (i) => h('div', null, h('strong', null, `${i.Employee.firstName} ${i.Employee.lastName}`), h('div', { class: 'muted small' }, i.Employee.matricule)) },
        { label: 'Base', align: 'right', render: (i) => fcfa(i.baseSalary) },
        { label: 'Bonus', align: 'right', render: (i) => fcfa(i.bonus) },
        { label: 'CNPS', align: 'right', render: (i) => fcfa(i.cnpsEmployee) },
        { label: 'PAYE', align: 'right', render: (i) => fcfa(i.paye) },
        { label: 'Deductions', align: 'right', render: (i) => fcfa(i.deductions) },
        { label: 'Net pay', align: 'right', render: (i) => h('strong', null, fcfa(i.net)) },
        {
          label: '', actions: true, render: (i) => (paid
            ? h('button', {
              class: 'btn ghost sm',
              type: 'button',
              onClick: (ev) => busy(ev.currentTarget, () => download(`/payroll/payslip/${i.id}`, `payslip-${i.Employee.matricule}-${payroll.year}-${String(payroll.month).padStart(2, '0')}.pdf`)),
            }, 'Payslip PDF')
            : h('button', { class: 'btn ghost sm', type: 'button', onClick: () => editItem(i, load) }, 'Adjust')),
        },
      ], items, {
        empty: 'This payroll has no lines.',
        foot: h('tfoot', null, h('tr', null,
          h('td', null, 'Totals'), ...['baseSalary', 'bonus', 'cnpsEmployee', 'paye', 'deductions', 'net'].map((k) => h('td', { class: 'right num' }, fcfa(sum(k)))), h('td'))),
      }));
  }

  const gen = h('button', { class: 'btn', type: 'button' }, 'Generate payroll');
  gen.addEventListener('click', () => busy(gen, async () => {
    const r = await api('/payroll/generate', { method: 'POST', body: { month: Number(month.value), year: Number(year.value) } });
    toast(`Draft payroll generated for ${r.items.length} employees`, 'ok');
    await load();
  }));
  const loadBtn = h('button', { class: 'btn secondary', type: 'button', onClick: (ev) => busy(ev.currentTarget, load) }, 'View');

  box.append(
    h('div', { class: 'notice' }, 'CNPS employee share 4.2% of base salary (capped at 27,500 FCFA/month); PAYE (IRPP) on the taxable remainder using the configured simplified brackets.'),
    h('div', { class: 'toolbar' }, field('Month', month), field('Year', year), loadBtn, gen),
    out);
  await load();
}

export default async function render(root) {
  const manager = isManager();
  const me = await getMe();
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, manager ? 'Payroll' : 'Payslips'),
    h('p', { class: 'muted' }, manager ? 'Generate, adjust and pay monthly payroll with CNPS and PAYE deductions.' : 'Download your monthly payslips.'))));

  if (manager) await managerSection(root);
  if (me) {
    const mine = h('div', { style: manager ? 'margin-top:34px' : '' });
    root.append(mine);
    await myPayslips(mine);
  } else if (!manager) {
    root.append(h('div', { class: 'notice warn' }, 'Your account is not linked to an employee record yet. Ask HR to link it to see your payslips.'));
  }
}
