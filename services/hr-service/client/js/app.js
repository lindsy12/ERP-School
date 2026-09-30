import { session, isManager, setToken, clearToken, login, getTenantId } from './api.js';
import { h, svg, clear, loading, toast } from './ui.js';
import { resetMe } from './state.js';

const ICONS = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  calendar: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
  wallet: 'M3 7h18v13H3zM3 7l3-4h12l3 4M16 14h2',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
};
const icon = (name) => svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, svg('path', { d: ICONS[name] }));

const ROUTES = [
  { path: 'dashboard', label: 'Dashboard', icon: 'grid', managerOnly: true, load: () => import('./pages/dashboard.js') },
  { path: 'employees', label: 'Employees', icon: 'users', managerOnly: true, load: () => import('./pages/employees.js') },
  { path: 'attendance', label: 'Attendance', icon: 'clock', load: () => import('./pages/attendance.js') },
  { path: 'leave', label: 'Leave', icon: 'calendar', load: () => import('./pages/leave.js') },
  { path: 'payroll', label: 'Payroll', staffLabel: 'Payslips', icon: 'wallet', load: () => import('./pages/payroll.js') },
  { path: 'assets', label: 'Assets', icon: 'box', load: () => import('./pages/assets.js') },
];

const $ = (id) => document.getElementById(id);
let navToken = 0; // ignores results of a page load that a newer navigation superseded

function visibleRoutes() { return ROUTES.filter((r) => !r.managerOnly || isManager()); }
function defaultRoute() { return isManager() ? 'dashboard' : 'attendance'; }

function showLogin(message) {
  $('shell').hidden = true;
  $('login').hidden = false;
  $('login-msg').textContent = message || '';
  $('login-msg').hidden = !message;
  if (!$('tenant').value) $('tenant').value = getTenantId();
}

function buildShell() {
  const s = session();
  const nav = $('nav');
  clear(nav);
  visibleRoutes().forEach((r) => nav.appendChild(h('a', { href: `#/${r.path}`, 'data-route': r.path }, icon(r.icon), (!isManager() && r.staffLabel) || r.label)));
  $('who').textContent = `${s.role}${s.id ? ` · user #${s.id}` : ''}`;
}

async function route() {
  if (!session()) { showLogin(); return; }
  // HR is for school staff; students get the ERP's "not for your role" notice.
  if (session().role === 'STUDENT') {
    const { allowRoles } = await import('/auth/js/access.js');
    await allowRoles(['SUPER_ADMIN', 'ADMIN', 'STAFF']);
    return;
  }
  $('login').hidden = true;
  $('shell').hidden = false;
  buildShell();

  const wanted = (location.hash.replace(/^#\//, '') || '').split('?')[0];
  const allowed = visibleRoutes();
  const current = allowed.find((r) => r.path === wanted);
  if (!current) { location.hash = `#/${defaultRoute()}`; return; }

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
    document.title = `${(!isManager() && current.staffLabel) || current.label} · HR · School ERP`;
    view.focus({ preventScroll: true });
  } catch (err) {
    if (token !== navToken) return;
    clear(view);
    view.appendChild(h('div', { class: 'card empty' },
      h('strong', null, 'Something went wrong loading this page'),
      h('p', null, err.message),
      h('button', { class: 'btn secondary', type: 'button', onClick: route }, 'Try again')));
  }
}

function initLogin() {
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || $('login-submit');
    btn.disabled = true;
    try {
      const f = new FormData(e.target);
      setToken(await login(f.get('tenant').trim(), f.get('email'), f.get('password')));
      resetMe();
      location.hash = '';
      route();
    } catch (err) {
      showLogin(err.status === 404
        ? 'The sign-in service is not reachable from this address. Paste an access token below instead.'
        : err.message);
    } finally { btn.disabled = false; }
  });

  $('token-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const token = new FormData(e.target).get('token').trim();
    if (!token) return;
    setToken(token);
    if (!session()) { clearToken(); showLogin('That token is malformed or has expired.'); return; }
    resetMe();
    location.hash = '';
    route();
  });
}

function boot() {
  initLogin();
  $('logout').addEventListener('click', () => { clearToken(); resetMe(); location.hash = ''; showLogin('You have been signed out.'); });
  window.addEventListener('auth:expired', () => { resetMe(); showLogin('Your session has expired — please sign in again.'); });
  window.addEventListener('hashchange', route);
  window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Unexpected error', 'bad'));
  route();
}

boot();
