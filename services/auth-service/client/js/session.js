// The School ERP browser session, shared by every module's pages.
//
// All pages are served by the gateway from one origin, so they share localStorage and therefore
// one login. Other modules can use this file directly instead of writing their own:
//
//   import { api, requireSession, signOut } from '/auth/js/session.js';
//   requireSession();                          // not signed in -> sign-in page, then back here
//   const employees = await api('/api/v1/hr/employees');
//
// api() adds the access token, and when it has expired, gets a new one with the refresh token and
// retries, so users are not sent back to the sign-in page every 15 minutes.
//
// Storage keys (the HR client uses the first and last too, so a sign-in on either side counts):
export const ACCESS_KEY = 'erp_access_token';
export const REFRESH_KEY = 'erp_refresh_token';
export const TENANT_KEY = 'erp_tenant_id';

const SIGN_IN_PAGE = '/auth/';
const EXPIRY_MARGIN_MS = 10_000; // refresh slightly early rather than send a token about to expire

function read(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value); else localStorage.removeItem(key);
  } catch (e) { /* storage blocked (private mode): the session lasts until the page is closed */ }
}

export const getTenantId = () => read(TENANT_KEY) || '';
export const setTenantId = (id) => write(TENANT_KEY, id);

function storeTokens({ access_token: access, refresh_token: refresh }) {
  write(ACCESS_KEY, access);
  write(REFRESH_KEY, refresh);
}

export function clearSession() {
  write(ACCESS_KEY, null);
  write(REFRESH_KEY, null);
}

// The access token's claims, decoded but NOT verified: only for deciding what to show. The server
// checks every request, and the role it acts on is the one in the database (see /me).
function claims(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(part))));
  } catch (e) {
    return null;
  }
}

const isFresh = (token) => {
  const c = token && claims(token);
  return Boolean(c && c.exp * 1000 > Date.now() + EXPIRY_MARGIN_MS);
};

// True while the user has a usable access token, or a refresh token to get one.
export const isSignedIn = () => isFresh(read(ACCESS_KEY)) || Boolean(read(REFRESH_KEY));

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || [];
  }
}

async function errorFrom(res) {
  try {
    const { error } = await res.json();
    if (error) return new ApiError(error.message, res.status, error.code, error.details);
  } catch (e) { /* not JSON, e.g. a proxy error page */ }
  return new ApiError(`Request failed (${res.status})`, res.status);
}

function send(path, { method = 'GET', body, token } = {}) {
  return fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Refresh tokens work only once (rotation). If two tabs refreshed with the same one at the same
// time, auth-service would see a reuse and end the session for both. So refreshes are serialised
// across tabs with a Web Lock, and a tab that gets the lock first checks whether another tab has
// already stored a fresh token. `stale` is the access token that was found expired or was refused:
// the same token looking fresh here only means this computer's clock is off, so it is refreshed anyway.
async function refreshOnce(stale) {
  const used = read(REFRESH_KEY);
  if (!used) return false;
  const current = read(ACCESS_KEY);
  if (current !== stale && isFresh(current)) return true;

  const res = await send('/api/v1/auth/refresh', { method: 'POST', body: { refresh_token: used } }).catch(() => null);
  if (!res) return false; // network problem: keep the tokens, the next call may work
  if (!res.ok) {
    if (read(REFRESH_KEY) === used) clearSession(); // rejected, and nobody has replaced it meanwhile
    return false;
  }
  storeTokens(await res.json());
  return true;
}

let pending = null; // one refresh at a time within this tab
function refreshTokens(stale) {
  const run = () => refreshOnce(stale);
  pending ??= (navigator.locks ? navigator.locks.request('erp-token-refresh', run) : run())
    .finally(() => { pending = null; });
  return pending;
}

// A usable access token, refreshing it first if needed. null = the user must sign in again.
export async function accessToken() {
  const token = read(ACCESS_KEY);
  if (isFresh(token)) return token;
  return (await refreshTokens(token)) ? read(ACCESS_KEY) : null;
}

function signedOut() {
  clearSession();
  window.dispatchEvent(new Event('auth:expired'));
}

// Calls the API through the gateway. Returns the parsed JSON (null for 204), or throws ApiError.
// A 401 means the session is over: tokens are cleared and an "auth:expired" event is fired.
export async function api(path, { method = 'GET', body } = {}) {
  const token = await accessToken();
  let res = await send(path, { method, body, token });

  if (res.status === 401) {
    const error = await errorFrom(res.clone());
    // Expired between our check and the server's (or this computer's clock is off): refresh once, retry.
    if (error.code === 'TOKEN_EXPIRED' && (await refreshTokens(token))) {
      res = await send(path, { method, body, token: read(ACCESS_KEY) });
    }
  }
  if (res.status === 401) signedOut();
  if (!res.ok) throw await errorFrom(res);
  return res.status === 204 ? null : res.json();
}

export async function signIn(tenantId, email, password) {
  const res = await send('/api/v1/auth/login', { method: 'POST', body: { tenant_id: tenantId, email, password } });
  if (!res.ok) throw await errorFrom(res);
  storeTokens(await res.json());
  setTenantId(tenantId);
}

// Stores the new pair returned by /change-password (the old session was ended by the server).
export const replaceTokens = storeTokens;

// Ends the session on the server too, so the refresh token can't be used again. Never fails:
// the local tokens are cleared whatever happens.
export async function signOut() {
  const refresh = read(REFRESH_KEY);
  const token = await accessToken().catch(() => null);
  if (refresh && token) {
    await send('/api/v1/auth/logout', { method: 'POST', body: { refresh_token: refresh }, token }).catch(() => {});
  }
  clearSession();
}

// Only same-site paths, so a crafted link can't send the user to another website after sign-in.
export function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : null;
}

// For other modules' pages: if nobody is signed in, go to the sign-in page, which comes back here.
export function requireSession() {
  if (isSignedIn()) return true;
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  location.assign(`${SIGN_IN_PAGE}?next=${next}`);
  return false;
}
