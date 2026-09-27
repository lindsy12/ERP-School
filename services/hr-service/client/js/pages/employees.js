import { api } from '../api.js';
import { h, clear, field, select, table, badge, fcfa, fmtDate, modal, confirmDialog, toast, busy, loading } from '../ui.js';

const state = { page: 1, search: '', department: '', status: '' };

function employeeForm(existing, onSaved) {
  const e = existing || {};
  const input = (name, type = 'text', extra = {}) => h('input', { name, type, value: e[name] ?? '', ...extra });
  const form = h('form', { class: 'form-grid', id: 'emp-form' },
    field('First name', input('firstName', 'text', { required: true, maxlength: 100 })),
    field('Last name', input('lastName', 'text', { required: true, maxlength: 100 })),
    field('Email', input('email', 'email', { required: true })),
    field('Phone', input('phone', 'tel', { maxlength: 30 })),
    field('Department', input('department', 'text', { required: true, maxlength: 100 })),
    field('Role / job title', input('role', 'text', { required: true, maxlength: 100 })),
    field('Hire date', input('hireDate', 'date', { required: true, value: e.hireDate || '' })),
    field('Base salary (FCFA / month)', input('baseSalary', 'number', { required: true, min: 0, step: '1' })),
    field('Auth user ID', input('userId', 'number', { min: 1 }), 'Optional — links this employee to their login account so they can use self-service.'),
    existing ? field('Status', select('status', ['active', 'inactive'], e.status)) : null,
    existing ? h('div', { class: 'field' }, h('label', null, 'Matricule'), h('input', { value: e.matricule, disabled: true }), h('span', { class: 'hint' }, 'Generated automatically and cannot be changed.')) : null);

  const submit = h('button', { class: 'btn', type: 'submit', form: 'emp-form' }, existing ? 'Save changes' : 'Create employee');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    busy(submit, async () => {
      const raw = Object.fromEntries(new FormData(form));
      const body = {
        ...raw,
        baseSalary: Number(raw.baseSalary),
        userId: raw.userId === '' ? null : Number(raw.userId),
        phone: raw.phone || null,
      };
      const saved = existing
        ? await api(`/employees/${existing.id}`, { method: 'PUT', body })
        : await api('/employees', { method: 'POST', body });
      toast(existing ? 'Employee updated' : `Employee created — matricule ${saved.matricule}`, 'ok');
      onSaved();
      return saved;
    }).then((saved) => { if (saved) document.querySelector('dialog')?.close(); });
  });
  return { form, submit };
}

function openForm(existing, onSaved) {
  const { form, submit } = employeeForm(existing, onSaved);
  modal(existing ? `Edit ${existing.firstName} ${existing.lastName}` : 'New employee', (close) => ({
    body: form,
    actions: [h('button', { class: 'btn secondary', type: 'button', onClick: close }, 'Cancel'), submit],
  }));
}

async function openBadge(emp) {
  const { image } = await api(`/attendance/qr/${emp.id}`);
  modal('Attendance badge', () => ({
    body: h('div', { class: 'qr-box' },
      h('img', { src: image, alt: `Attendance QR code for ${emp.firstName} ${emp.lastName}` }),
      h('strong', null, `${emp.firstName} ${emp.lastName}`),
      h('span', { class: 'muted' }, emp.matricule),
      h('p', { class: 'muted small' }, 'Signed and valid for today only — it regenerates every day. Scan it at the entrance to check in.'),
      h('a', { class: 'btn secondary sm', href: image, download: `badge-${emp.matricule}.png` }, 'Download PNG')),
  }));
}

export default async function render(root) {
  const list = h('div', { id: 'emp-list' }, loading());

  async function load() {
    const params = new URLSearchParams({ page: state.page, limit: 10 });
    ['search', 'department', 'status'].forEach((k) => { if (state[k]) params.set(k, state[k]); });
    const res = await api(`/employees?${params}`);
    clear(list);
    list.append(
      table([
        { label: 'Matricule', key: 'matricule' },
        { label: 'Name', render: (r) => h('div', null, h('strong', null, `${r.firstName} ${r.lastName}`), h('div', { class: 'muted small' }, r.email)) },
        { label: 'Department', key: 'department' },
        { label: 'Role', key: 'role' },
        { label: 'Hired', render: (r) => fmtDate(r.hireDate) },
        { label: 'Base salary', align: 'right', render: (r) => fcfa(r.baseSalary) },
        { label: 'Status', render: (r) => badge(r.status) },
        {
          label: '', actions: true, render: (r) => h('div', null,
            h('button', { class: 'btn ghost sm', type: 'button', onClick: () => openForm(r, load) }, 'Edit'),
            h('button', { class: 'btn ghost sm', type: 'button', onClick: () => openBadge(r).catch((e) => toast(e.message, 'bad')) }, 'Badge'),
            r.status === 'active' ? h('button', {
              class: 'btn ghost sm',
              type: 'button',
              onClick: async () => {
                if (!(await confirmDialog('Deactivate employee', `Are you sure you want to deactivate ${r.firstName} ${r.lastName}? Their record is kept, but they will be excluded from payroll.`, 'Deactivate', true))) return;
                try { await api(`/employees/${r.id}`, { method: 'DELETE' }); toast('Employee deactivated', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); }
              },
            }, 'Deactivate') : null),
        },
      ], res.data, { empty: 'No employees match these filters.' }),
      h('div', { class: 'pager' },
        h('span', { class: 'muted' }, `${res.total} employee${res.total === 1 ? '' : 's'} · page ${res.page} of ${Math.max(res.totalPages, 1)}`),
        h('div', null,
          h('button', { class: 'btn secondary sm', type: 'button', disabled: res.page <= 1, onClick: () => { state.page -= 1; load(); } }, 'Previous'), ' ',
          h('button', { class: 'btn secondary sm', type: 'button', disabled: res.page >= res.totalPages, onClick: () => { state.page += 1; load(); } }, 'Next'))));
  }

  const filters = h('form', { class: 'toolbar', role: 'search' },
    field('Search', h('input', { name: 'search', type: 'search', placeholder: 'Name or matricule', value: state.search })),
    field('Department', h('input', { name: 'department', placeholder: 'e.g. Academic', value: state.department })),
    field('Status', select('status', [['', 'All'], ['active', 'Active'], ['inactive', 'Inactive']], state.status)),
    h('button', { class: 'btn secondary', type: 'submit' }, 'Apply'));
  filters.addEventListener('submit', (ev) => {
    ev.preventDefault();
    Object.assign(state, Object.fromEntries(new FormData(filters)), { page: 1 });
    load().catch((e) => toast(e.message, 'bad'));
  });

  root.append(
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Employees'), h('p', { class: 'muted' }, 'Create, search and manage employee records.')),
      h('button', { class: 'btn', type: 'button', onClick: () => openForm(null, load) }, '+ New employee')),
    filters, list);
  await load();
}
