// API client + session handling. Shared conventions (see docs/frontend-conventions.md):
//   - the access token lives in localStorage under "erp_access_token"
//   - API calls are relative to the site origin, so they work behind the gateway
export const API = '/api/v1/hr';
export const TOKEN_KEY = 'erp_access_token';

export const MANAGER_ROLES = ['SuperAdmin', 'Admin'];

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* storage blocked: session lasts until reload */ }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}

// Decodes (does NOT verify) the JWT payload, purely so the UI can hide things the
// user can't use. The server re-checks every request — this is not a security boundary.
export function session() {
  const token = getToken();
  if (!token) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(escape(atob(part))));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null; // expired → force login
    return payload;
  } catch (e) {
    return null;
  }
}

export const isManager = () => MANAGER_ROLES.includes((session() || {}).role);

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('auth:expired'));
  }
  return res;
}

async function errorFrom(res) {
  let message = `Request failed (${res.status})`;
  try { message = (await res.json()).error || message; } catch (e) { /* non-JSON body */ }
  return new ApiError(message, res.status);
}

export async function api(path, options) {
  const res = await request(`${API}${path}`, options);
  if (!res.ok) throw await errorFrom(res);
  return res.status === 204 ? null : res.json();
}

export async function login(email, password) {
  const res = await request('/api/v1/auth/login', { method: 'POST', body: { email, password } });
  if (!res.ok) throw await errorFrom(res);
  const data = await res.json();
  const token = data.accessToken || data.access_token || data.token;
  if (!token) throw new Error('Login succeeded but no access token was returned');
  return token;
}

// Fetches a binary response with the auth header and hands it to the browser as a download.
export async function download(path, filename) {
  const res = await request(`${API}${path}`);
  if (!res.ok) throw await errorFrom(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
