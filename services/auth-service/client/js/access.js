// Page-level role check, shared by every module's pages:
//
//   import { allowRoles } from '/auth/js/access.js';
//   const me = await allowRoles(['SUPER_ADMIN', 'ADMIN', 'STAFF']);
//   if (!me) return;   // not signed in (sent to sign-in) or wrong role (page replaced by a notice)
//
// This only decides what to show. Every service checks the role again on its API, which is the
// real protection.
import { api, requireSession } from './session.js';

export const ROLE_LABELS = { SUPER_ADMIN: 'Super admin', ADMIN: 'Admin', STAFF: 'Staff', STUDENT: 'Student' };

function showNotAllowed(me) {
  const box = document.createElement('main');
  box.setAttribute('style', 'max-width:520px;margin:12vh auto;padding:28px;font-family:system-ui,sans-serif;'
    + 'background:#fff;color:#18212f;border:1px solid #e1e6ef;border-radius:12px;text-align:center');
  const title = document.createElement('h1');
  title.setAttribute('style', 'font-size:22px;margin:0 0 8px');
  title.textContent = 'This page is not for your role';
  const text = document.createElement('p');
  text.setAttribute('style', 'color:#5a6577;margin:0 0 20px');
  text.textContent = `You are signed in as ${me.email} (${ROLE_LABELS[me.role] || me.role}). Your home page lists what you can use.`;
  const home = document.createElement('a');
  home.href = '/auth/#/home';
  home.textContent = 'Go to my home page';
  home.setAttribute('style', 'display:inline-block;padding:9px 16px;border-radius:8px;background:#1d4f91;color:#fff;text-decoration:none;font-weight:600');
  box.append(title, text, home);
  document.body.replaceChildren(box);
  document.body.setAttribute('style', 'margin:0;background:#f4f6fa');
  document.title = 'Not available · School ERP';
}

// Resolves to the signed-in user ({ id, email, role, tenant_id }) when their role is in `roles`,
// otherwise to null (after redirecting to sign-in, or replacing the page with a notice).
export async function allowRoles(roles) {
  if (!requireSession()) return null;
  const me = await api('/api/v1/auth/me');
  if (roles.includes(me.role)) return me;
  showNotAllowed(me);
  return null;
}

// For pages that send some roles elsewhere, e.g. students to their portal.
export async function currentUser() {
  if (!requireSession()) return null;
  return api('/api/v1/auth/me');
}
