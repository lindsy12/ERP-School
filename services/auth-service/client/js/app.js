// Sign-in page and the small "Accounts" app around it: home (module launcher), my account, users.
// Hash routes (#/home, #/account, #/users) so the server only ever serves index.html.
import { isSignedIn, signIn, signOut, getTenantId, setTenantId, safeNext } from './session.js';
import { loadMe, resetMe, isAdmin, ROLE_LABELS } from './me.js';
import { h, svg, clear, loading, toast } from './ui.js';

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zM15.5 7.5l3 3L22 7l-3-3',
};
export const icon = (d) => svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, svg('path', { d }));

const ROUTES = [
  { path: 'home', label: 'Home', icon: ICONS.home, load: () => import('./pages/home.js') },
  { path: 'users', label: 'Users', icon: ICONS.users, adminOnly: true, load: () => import('./pages/users.js') },
  { path: 'account', label: 'My account', icon: ICONS.key, load: () => import('./pages/account.js') },
];

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let navToken = 0; // ignores results of a page load that a newer navigation superseded

const visibleRoutes = () => ROUTES.filter((r) => !r.adminOnly || isAdmin());

function showLogin(message) {
  resetMe();
  $('shell').hidden = true;
  $('login').hidden = false;
  $('login-msg').textContent = message || '';
  $('login-msg').hidden = !message;
  if (!$('tenant').value) $('tenant').value = getTenantId();
  ($('tenant').value ? $('email') : $('tenant')).focus();
  document.title = 'Sign in · School ERP';
}

// After signing in: back to the module page that sent the user here (?next=/hr/), or home.
function leaveLogin() {
  const next = safeNext(params.get('next'));
  if (next) { location.assign(next); return; }
  history.replaceState(null, '', `${location.pathname}#/home`);
  route();
}

function buildShell(me) {
  const nav = $('nav');
  clear(nav);
  visibleRoutes().forEach((r) => nav.appendChild(h('a', { href: `#/${r.path}`, 'data-route': r.path }, icon(r.icon), r.label)));
  $('who').textContent = me.email;
  $('who-role').textContent = ROLE_LABELS[me.role] || me.role;
}

async function route() {
  if (!isSignedIn()) { showLogin(); return; }

  let me;
  try {
    me = await loadMe();
  } catch (err) {
    if (err.status === 401) return; // auth:expired already shows the sign-in page
    showLogin(`Could not reach the sign-in service: ${err.message}`);
    return;
  }
  $('login').hidden = true;
  $('shell').hidden = false;
  buildShell(me);

  const wanted = location.hash.replace(/^#\//, '').split('?')[0];
  const current = visibleRoutes().find((r) => r.path === wanted);
  if (!current) { location.hash = '#/home'; return; }

  document.querySelectorAll('#nav a').forEach((a) => {
    if (a.dataset.route === current.path) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  const view = $('view');
  const token = ++navToken;
  clear(view);
  view.appendChild(loading());
  try {
    const page = await current.load();
    const fresh = h('div');
    await page.default(fresh);
    if (token !== navToken) return;
    clear(view);
    view.appendChild(fresh);
    document.title = `${current.label} · School ERP`;
    view.focus({ preventScroll: true });
  } catch (err) {
    if (token !== navToken || err.status === 401) return;
    clear(view);
    view.appendChild(h('div', { class: 'card empty' },
      h('strong', null, 'Something went wrong loading this page'),
      h('p', null, err.message),
      h('button', { class: 'btn secondary', type: 'button', onClick: route }, 'Try again')));
  }
}

const LOGIN_ERRORS = {
  INVALID_CREDENTIALS: 'Wrong email or password.',
  ACCOUNT_LOCKED: 'Too many wrong passwords. Your account is locked for a few minutes, or until an administrator unlocks it.',
  RATE_LIMITED: 'Too many sign-in attempts from this network. Please wait a minute and try again.',
  VALIDATION_ERROR: 'Check the School ID and email: one of them is not in the right format.',
};

function initLogin() {
  // A school's sign-in link (…/auth/?school=<id>) fills in and remembers the School ID.
  const school = params.get('school');
  if (school) setTenantId(school.trim());

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-submit');
    btn.disabled = true;
    try {
      const f = new FormData(e.target);
      await signIn(f.get('tenant').trim(), f.get('email').trim(), f.get('password'));
      e.target.reset();
      leaveLogin();
    } catch (err) {
      showLogin(LOGIN_ERRORS[err.code] || err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function boot() {
  initLogin();
  $('logout').addEventListener('click', async () => {
    await signOut();
    history.replaceState(null, '', location.pathname);
    showLogin('You have been signed out.');
  });
  window.addEventListener('auth:expired', () => showLogin('Your session has ended. Please sign in again.'));
  window.addEventListener('hashchange', route);
  window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Unexpected error', 'bad'));

  // Already signed in (e.g. from another module) and sent here with ?next=: go straight back.
  if (isSignedIn() && safeNext(params.get('next'))) { leaveLogin(); return; }
  route();
}

boot();
