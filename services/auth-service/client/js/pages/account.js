// My account: details and changing your own password.
import { h, field, busy, toast } from '../ui.js';
import { api, replaceTokens } from '../session.js';
import { loadMe, ROLE_LABELS } from '../me.js';

const MIN_PASSWORD_LENGTH = 8; // same rule as auth-service

function passwordInput(name, autocomplete) {
  return h('input', { name, type: 'password', autocomplete, required: true, maxlength: 72 });
}

export default async function account(root) {
  const me = await loadMe();

  const current = passwordInput('current_password', 'current-password');
  const next = passwordInput('new_password', 'new-password');
  const again = passwordInput('confirm', 'new-password');
  next.minLength = MIN_PASSWORD_LENGTH;
  const message = h('div', { class: 'notice bad', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Change password');

  const showError = (text) => { message.textContent = text; message.hidden = false; };

  const form = h('form', { class: 'form-grid' },
    h('div', { class: 'full' }, message),
    h('div', { class: 'full' }, field('Current password', current)),
    field('New password', next, `At least ${MIN_PASSWORD_LENGTH} characters.`),
    field('Repeat new password', again),
    h('div', { class: 'full' }, submit));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    message.hidden = true;
    if (next.value !== again.value) { showError('The two new passwords are different.'); return; }
    busy(submit, async () => {
      try {
        const tokens = await api('/api/v1/auth/change-password', {
          method: 'POST',
          body: { current_password: current.value, new_password: next.value },
        });
        replaceTokens(tokens); // the server ended every session, including the old one of this tab
        form.reset();
        toast('Password changed. You have been signed out on your other devices.', 'ok');
      } catch (err) {
        if (err.code === 'VALIDATION_ERROR' && err.details.length) {
          const LABELS = { current_password: 'Current password', new_password: 'New password' };
          showError(err.details.map((d) => `${LABELS[d.field] || d.field} ${d.message}.`).join(' '));
        } else if (err.code === 'ACCOUNT_LOCKED') {
          showError('Too many wrong passwords: your account is locked for a few minutes.');
        } else {
          throw err;
        }
      }
    });
  });

  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'My account'))),
    h('div', { class: 'cols two' },
      h('div', { class: 'card' },
        h('h2', null, 'Details'),
        h('dl', { class: 'kv' },
          h('dt', null, 'Email'), h('dd', null, me.email),
          h('dt', null, 'Role'), h('dd', null, ROLE_LABELS[me.role] || me.role),
          h('dt', null, 'School ID'), h('dd', null, h('code', null, me.tenant_id)))),
      h('div', { class: 'card' }, h('h2', null, 'Change password'), form)),
  );
}
