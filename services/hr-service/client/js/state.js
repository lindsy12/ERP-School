import { api } from './api.js';

// The logged-in user's own Employee record (null if their account isn't linked to one —
// e.g. a pure admin). Cached per page load; call resetMe() on login/logout.
let mePromise;

export function getMe() {
  if (!mePromise) {
    mePromise = api('/employees/me').catch((err) => {
      if (err.status === 404) return null;
      mePromise = undefined; // real failure: allow a retry
      throw err;
    });
  }
  return mePromise;
}

export function resetMe() { mePromise = undefined; }

export const NOT_LINKED = 'Your account is not linked to an employee record yet, so personal features (check-in, leave, payslips) are unavailable. Ask HR to link your account.';
