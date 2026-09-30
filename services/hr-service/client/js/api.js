// API client + session handling. Shared conventions (see docs/gateway.md, CLAUDE.md):
//   - the access token lives in localStorage under "erp_access_token"
//   - API calls are relative to the site origin, so they work behind the gateway
//   - errors are always { error: { code, message, details? } }
export const API = '/api/v1/hr';
export const TOKEN_KEY = 'erp_access_token';
export const TENANT_KEY = 'erp_tenant_id';

// Canonical role names, set by auth-service (see docs/api-contracts/auth-service.md).
export const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN'];

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* storage blocked: session lasts until reload */ }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}
export function getTenantId() {
  try { return localStorage.getItem(TENANT_KEY) || ''; } catch (e) { return ''; }
}
export function setTenantId(id) {
  try { localStorage.setItem(TENANT_KEY, id); } catch (e) { /* ignore */ }
}

// Decodes (does NOT verify) the JWT payload, purely so the UI can hide things the
// user can't use. The server re-checks every request — this is not a security boundary.
// Normalizes auth-service's claims (sub/tenant_id) to id/tenantId for convenience.
export function session() {
  const token = getToken();
  if (!token) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(escape(atob(part))));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null; // expired → force login
    return { ...payload, id: payload.sub || payload.id, tenantId: payload.tenant_id || payload.tenantId };
  } catch (e) {
    return null;
  }
}

export const isManager = () => MANAGER_ROLES.includes((session() || {}).role);

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
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
  let code;
  try {
    const data = (await res.json()).error;
    if (data) { message = data.message || message; code = data.code; }
  } catch (e) { /* non-JSON body */ }
  return new ApiError(message, res.status, code);
}

export async function api(path, options) {
  const res = await request(`${API}${path}`, options);
  if (!res.ok) throw await errorFrom(res);
  return res.status === 204 ? null : res.json();
}

export async function login(tenantId, email, password) {
  const res = await request('/api/v1/auth/login', { method: 'POST', body: { tenant_id: tenantId, email, password } });
  if (!res.ok) throw await errorFrom(res);
  const data = await res.json();
  if (!data.access_token) throw new Error('Login succeeded but no access token was returned');
  setTenantId(tenantId);
  return data.access_token;
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
