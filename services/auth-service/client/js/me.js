// The signed-in user, as the database knows them now (GET /api/v1/auth/me), not as the token says.
import { api } from './session.js';

let me = null;

export async function loadMe() {
  me ??= await api('/api/v1/auth/me');
  return me;
}
export const getMe = () => me;
export const resetMe = () => { me = null; };

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'STUDENT'];
export const ROLE_LABELS = { SUPER_ADMIN: 'Super admin', ADMIN: 'Admin', STAFF: 'Staff', STUDENT: 'Student' };

// Mirrors services/auth-service/src/config/roles.js, only to hide buttons that would get a 403.
const MANAGEABLE_ROLES = {
  SUPER_ADMIN: ['ADMIN', 'STAFF', 'STUDENT'],
  ADMIN: ['STAFF', 'STUDENT'],
};
export const manageableRoles = () => MANAGEABLE_ROLES[me?.role] || [];
export const canManage = (role) => manageableRoles().includes(role);
export const isAdmin = () => manageableRoles().length > 0;
