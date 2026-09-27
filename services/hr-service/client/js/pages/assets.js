import { api, isManager } from '../api.js';
import { h, clear, field, select, table, badge, fcfa, fmtDate, modal, confirmDialog, toast, busy, loading } from '../ui.js';
import { getMe } from '../state.js';

const STATUSES = ['available', 'assigned', 'maintenance', 'retired'];

async function openForm(asset, employees, onSaved) {
  const a = asset || {};
  const val = (name, type = 'text', extra = {}) => h('input', { name, type, value: a[name] ?? '', ...extra });
  const assignee = select('assignedTo', [['', '— Unassigned —'], ...employees.map((e) => [e.id, `${e.firstName} ${e.lastName} (${e.matricule})`])], a.assignedTo ?? '');
  const form = h('form', { id: 'asset-form', class: 'form-grid' },
    field('Name', val('name', 'text', { required: true, maxlength: 150 })),
    field('Category', val('category', 'text', { required: true, maxlength: 100 })),
    field('Serial number', val('serialNumber', 'text', { required: true, maxlength: 100 })),
    field('Status', select('status', STATUSES, a.status || 'available')),
    field('Assigned to', assignee),
    field('Purchase date', val('purchaseDate', 'date')),
    field('Value (FCFA)', val('value', 'number', { min: 0, step: '1' })));
  const submit = h('button', { class: 'btn', type: 'submit', form: 'asset-form' }, asset ? 'Save changes' : 'Add asset');
  modal(asset ? 'Edit asset' : 'New asset', (close) => {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      busy(submit, async () => {
        const raw = Object.fromEntries(new FormData(form));
        const body = {
          ...raw,
          assignedTo: raw.assignedTo === '' ? null : Number(raw.assignedTo),
          purchaseDate: raw.purchaseDate || null,
          value: raw.value === '' ? null : Number(raw.value),
        };
        await api(asset ? `/assets/${asset.id}` : '/assets', { method: asset ? 'PUT' : 'POST', body });
        toast(asset ? 'Asset updated' : 'Asset added', 'ok'); close(); onSaved();
      });
    });
    return { body: form, actions: [h('button', { class: 'btn secondary', type: 'button', onClick: close }, 'Cancel'), submit] };
  });
}

export default async function render(root) {
  const manager = isManager();
  const me = await getMe();
  let employees = [];
  if (manager) employees = (await api('/employees?limit=100&status=active')).data;
  const nameOf = (id) => {
    if (!id) return '—';
    if (me && me.id === id) return 'You';
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : 'Assigned';
  };

  const list = h('div', null, loading());
  const filter = select('status', [['', 'All statuses'], ...STATUSES], '');

  async function load() {
    const assets = await api(`/assets${filter.value ? `?status=${filter.value}` : ''}`);
    clear(list);
    list.append(table([
      { label: 'Asset', render: (a) => h('div', null, h('strong', null, a.name), h('div', { class: 'muted small' }, a.category)) },
      { label: 'Serial no.', key: 'serialNumber' },
      { label: 'Status', render: (a) => badge(a.status) },
      { label: 'Assigned to', render: (a) => nameOf(a.assignedTo) },
      { label: 'Purchased', render: (a) => fmtDate(a.purchaseDate) },
      { label: 'Value', align: 'right', render: (a) => (a.value == null ? '—' : fcfa(a.value)) },
      manager ? {
        label: '', actions: true, render: (a) => h('div', null,
          h('button', { class: 'btn ghost sm', type: 'button', onClick: () => openForm(a, employees, load) }, 'Edit'),
          h('button', {
            class: 'btn ghost sm',
            type: 'button',
            onClick: async () => {
              if (!(await confirmDialog('Delete asset', `Permanently delete "${a.name}" (${a.serialNumber})?`, 'Delete', true))) return;
              try { await api(`/assets/${a.id}`, { method: 'DELETE' }); toast('Asset deleted', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); }
            },
          }, 'Delete')),
      } : null,
    ].filter(Boolean), assets, { empty: 'No assets recorded.' }));
  }
  filter.addEventListener('change', () => load().catch((e) => toast(e.message, 'bad')));

  root.append(
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Assets & inventory'), h('p', { class: 'muted' }, manager ? 'Track equipment and who holds it.' : 'Equipment registered to the school — items assigned to you are marked.')),
      manager ? h('button', { class: 'btn', type: 'button', onClick: () => openForm(null, employees, load) }, '+ New asset') : null),
    h('div', { class: 'toolbar' }, field('Filter', filter)),
    list);
  await load();
}
