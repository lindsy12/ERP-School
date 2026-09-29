// Users (ADMIN, SUPER_ADMIN): create accounts, change roles, disable, reset passwords, unlock.
// Which buttons appear follows the server's rule (me.js); the server enforces it anyway.
import { h, clear, field, select, table, modal, busy, toast, badge, fmtDate, fmtDateTime, loading } from '../ui.js';
import { api } from '../session.js';
import { loadMe, canManage, manageableRoles, ROLES, ROLE_LABELS } from '../me.js';

const PAGE_SIZE = 20;
const MIN_PASSWORD_LENGTH = 8;
const roleLabel = (role) => ROLE_LABELS[role] || role;

// 12 characters without look-alikes (0/O, 1/l/I), easy to read out or copy onto paper.
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied', 'ok');
  } catch (e) {
    toast('Could not copy: select the text and copy it yourself.', 'bad');
  }
}

const copyable = (text) => h('div', { class: 'secret' },
  h('code', null, text),
  h('button', { class: 'btn secondary sm', type: 'button', onClick: () => copy(text) }, 'Copy'));

// Shown once after creating an account or resetting a password: the admin passes it on.
function showPassword(title, email, password) {
  modal(title, (close) => ({
    body: [
      h('p', null, 'Give these details to ', h('strong', null, email), '. The password is not shown again; they can change it under "My account" once signed in.'),
      field('Password', copyable(password)),
    ],
    actions: [h('button', { class: 'btn', type: 'button', onClick: close }, 'Done')],
  }));
}

// Turns an API error into a message for the dialog, listing field problems.
function describe(err) {
  if (err.code === 'VALIDATION_ERROR' && err.details.length) {
    return err.details.map((d) => `${d.field.replace('_', ' ')} ${d.message}.`).join(' ');
  }
  return err.message;
}

// A dialog whose form posts to the API; build(form) returns the fields, submit() does the call.
function formDialog(title, submitLabel, fields, submit) {
  const message = h('div', { class: 'notice bad', role: 'alert', hidden: true });
  const form = h('form', { class: 'form-grid' }, h('div', { class: 'full' }, message), fields);
  const button = h('button', { class: 'btn', type: 'submit' }, submitLabel);
  form.id = `f-${Math.random().toString(36).slice(2, 8)}`;
  button.setAttribute('form', form.id);

  modal(title, (close) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      message.hidden = true;
      busy(button, async () => {
        try {
          await submit();
          close();
        } catch (err) {
          message.textContent = describe(err);
          message.hidden = false;
        }
      });
    });
    return {
      body: form,
      actions: [h('button', { class: 'btn secondary', type: 'button', onClick: close }, 'Cancel'), button],
    };
  });
}

function passwordField(input) {
  input.minLength = MIN_PASSWORD_LENGTH;
  input.value = generatePassword();
  return h('div', { class: 'full' },
    field('Password', input, `At least ${MIN_PASSWORD_LENGTH} characters. A random one is suggested.`),
    h('button', { class: 'btn ghost sm', type: 'button', onClick: () => { input.value = generatePassword(); } }, 'Suggest another'));
}

function createDialog(onDone) {
  const email = h('input', { name: 'email', type: 'email', autocomplete: 'off', required: true });
  const role = select('role', manageableRoles().map((r) => [r, roleLabel(r)]), 'STUDENT');
  const password = h('input', { name: 'password', type: 'text', autocomplete: 'off', spellcheck: 'false', required: true, maxlength: 72 });

  formDialog('New account', 'Create account', [
    h('div', { class: 'full' }, field('Email', email)),
    h('div', { class: 'full' }, field('Role', role)),
    passwordField(password),
  ], async () => {
    const user = await api('/api/v1/auth/users', {
      method: 'POST',
      body: { email: email.value.trim(), password: password.value, role: role.value },
    });
    onDone();
    showPassword('Account created', user.email, password.value);
  });
}

function editDialog(user, onDone) {
  const role = select('role', manageableRoles().map((r) => [r, roleLabel(r)]), user.role);
  const active = h('input', { type: 'checkbox', name: 'is_active' });
  active.checked = user.is_active;

  formDialog(`Edit ${user.email}`, 'Save', [
    h('div', { class: 'full' }, field('Role', role)),
    h('label', { class: 'full check' }, active, 'Account active'),
    h('p', { class: 'full muted small' }, 'A disabled account is signed out at once and cannot sign in until it is enabled again.'),
  ], async () => {
    const body = {};
    if (role.value !== user.role) body.role = role.value;
    if (active.checked !== user.is_active) body.is_active = active.checked;
    if (Object.keys(body).length) {
      await api(`/api/v1/auth/users/${user.id}`, { method: 'PATCH', body });
      toast('Account updated', 'ok');
      onDone();
    }
  });
}

function resetDialog(user, onDone) {
  const password = h('input', { name: 'new_password', type: 'text', autocomplete: 'off', spellcheck: 'false', required: true, maxlength: 72 });

  formDialog(`Reset password for ${user.email}`, 'Reset password', [
    h('p', { class: 'full muted' }, 'They are signed out everywhere, and any lock from wrong passwords is lifted.'),
    passwordField(password),
  ], async () => {
    await api(`/api/v1/auth/users/${user.id}/reset-password`, { method: 'POST', body: { new_password: password.value } });
    onDone();
    showPassword('Password reset', user.email, password.value);
  });
}

async function unlock(user, button, onDone) {
  await busy(button, async () => {
    await api(`/api/v1/auth/users/${user.id}/unlock`, { method: 'POST' });
    toast(`${user.email} can sign in again`, 'ok');
    onDone();
  });
}

function status(user) {
  if (!user.is_active) return badge('Disabled', 'neutral');
  if (user.locked_until) return h('span', { title: `Locked until ${fmtDateTime(user.locked_until)}` }, badge('Locked', 'bad'));
  return badge('Active', 'ok');
}

export default async function users(root) {
  const me = await loadMe();
  const state = { role: '', page: 1 };
  const results = h('div');

  async function refresh() {
    clear(results);
    results.appendChild(loading());
    const query = new URLSearchParams({ page: state.page, limit: PAGE_SIZE });
    if (state.role) query.set('role', state.role);
    const { data, total } = await api(`/api/v1/auth/users?${query}`);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) { state.page = pages; return refresh(); }

    const actions = (user) => {
      if (user.id === me.id || !canManage(user.role)) return h('span', { class: 'muted' }, '—');
      const unlockBtn = h('button', { class: 'btn ghost sm', type: 'button' }, 'Unlock');
      unlockBtn.addEventListener('click', () => unlock(user, unlockBtn, refresh));
      return [
        h('button', { class: 'btn ghost sm', type: 'button', onClick: () => editDialog(user, refresh) }, 'Edit'),
        h('button', { class: 'btn ghost sm', type: 'button', onClick: () => resetDialog(user, refresh) }, 'Reset password'),
        user.locked_until ? unlockBtn : null,
      ];
    };

    clear(results);
    results.append(
      table([
        { label: 'Email', render: (u) => [u.email, u.id === me.id ? h('span', { class: 'muted' }, ' (you)') : null] },
        { label: 'Role', render: (u) => badge(roleLabel(u.role), u.role.includes('ADMIN') ? 'info' : '') },
        { label: 'Status', render: status },
        { label: 'Created', render: (u) => fmtDate(u.created_at) },
        { label: '', actions: true, render: actions },
      ], data, { empty: state.role ? `No ${roleLabel(state.role).toLowerCase()} accounts yet.` : 'No accounts yet.' }),
      h('div', { class: 'pager' },
        h('span', { class: 'muted' }, `${total} account${total === 1 ? '' : 's'} · page ${state.page} of ${pages}`),
        h('div', null,
          h('button', { class: 'btn secondary sm', type: 'button', disabled: state.page <= 1, onClick: () => { state.page -= 1; refresh(); } }, 'Previous'),
          ' ',
          h('button', { class: 'btn secondary sm', type: 'button', disabled: state.page >= pages, onClick: () => { state.page += 1; refresh(); } }, 'Next'))),
    );
    return undefined;
  }

  const roleFilter = select('role', [['', 'All roles'], ...ROLES.map((r) => [r, roleLabel(r)])], '');
  roleFilter.addEventListener('change', () => { state.role = roleFilter.value; state.page = 1; refresh(); });

  const signInLink = `${location.origin}/auth/?school=${encodeURIComponent(me.tenant_id)}`;

  root.append(
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Users'), h('p', { class: 'muted' }, 'Accounts of your school.')),
      h('button', { class: 'btn', type: 'button', onClick: () => createDialog(refresh) }, 'New account')),
    h('div', { class: 'card' },
      h('h2', null, "Your school's sign-in link"),
      h('p', { class: 'muted' }, 'Share it with new users: it fills in the School ID for them.'),
      copyable(signInLink)),
    h('div', { class: 'toolbar' }, field('Role', roleFilter)),
    results,
  );
  await refresh();
}
