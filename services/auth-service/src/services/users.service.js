// Account management by admins, independent of HTTP. Every action stays inside the admin's own
// school (tenant), and changing an account also needs the admin to outrank it (config/roles.js).
const crypto = require('crypto');
const userModel = require('../models/user.model');
const { hashPassword } = require('../utils/password');
const { canManage } = require('../config/roles');
const { revocationCutoff } = require('./token.service');
const HttpError = require('../utils/httpError');
const securityLog = require('../utils/securityLog');

const notFound = () => new HttpError(404, 'NOT_FOUND', 'User not found');
const forbidden = () => new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action');

const toIso = (value) => (value ? new Date(value).toISOString() : null);

// What clients see of an account. locked_until is only shown while the lock is still running.
function toPublicUser(row) {
  const lockedUntil = row.locked_until && new Date(row.locked_until) > new Date() ? row.locked_until : null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    email: row.email,
    role: row.role,
    is_active: Boolean(row.is_active),
    locked_until: toIso(lockedUntil),
    created_at: toIso(row.created_at),
  };
}

// A user of another school gets the same 404 as a missing one, so ids can't be probed.
async function findInSchool(admin, userId) {
  const user = await userModel.findById(userId);
  if (!user || user.tenant_id !== admin.tenant_id) throw notFound();
  return user;
}

// For every change to an account. Since nobody outranks themselves, this also stops admins from
// changing their own account here (they use POST /change-password).
async function findManageable(admin, userId) {
  const user = await findInSchool(admin, userId);
  if (!canManage(admin.role, user.role)) throw forbidden();
  return user;
}

async function createUser(admin, { email, password, role }) {
  if (!canManage(admin.role, role)) throw forbidden();

  const id = crypto.randomUUID();
  try {
    await userModel.create({
      id,
      tenantId: admin.tenant_id,
      email,
      passwordHash: await hashPassword(password),
      role,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'EMAIL_TAKEN', 'A user with this email already exists in this school');
    }
    throw err;
  }

  securityLog('info', 'auth.user.created', {
    message: 'Account created by an administrator',
    userId: id,
    tenantId: admin.tenant_id,
    role,
    createdBy: admin.id,
  });
  return toPublicUser(await userModel.findById(id));
}

async function listUsers(admin, { role, page, limit }) {
  const { rows, total } = await userModel.listByTenant({
    tenantId: admin.tenant_id,
    role,
    limit,
    offset: (page - 1) * limit,
  });
  return { data: rows.map(toPublicUser), page, limit, total };
}

async function getUser(admin, userId) {
  return toPublicUser(await findInSchool(admin, userId));
}

// Change role and/or is_active. Disabling ends the user's sessions; their access token is already
// refused by the next GET /verify, because it reads is_active from the database.
async function updateUser(admin, userId, { role, isActive }) {
  await findManageable(admin, userId);
  if (role !== undefined && !canManage(admin.role, role)) throw forbidden();

  await userModel.update(userId, { role, isActive });
  securityLog('info', 'auth.user.updated', {
    message: 'Account changed by an administrator',
    userId,
    tenantId: admin.tenant_id,
    changes: { role, is_active: isActive },
    updatedBy: admin.id,
  });
  return toPublicUser(await userModel.findById(userId));
}

// For a user who forgot their password: the admin sets a temporary one and gives it to them.
// Every session of that user ends and any lockout is cleared.
async function resetPassword(admin, userId, newPassword) {
  await findManageable(admin, userId);

  await userModel.setPassword(userId, await hashPassword(newPassword), revocationCutoff());
  securityLog('info', 'auth.password.reset', {
    message: 'Password reset by an administrator; all sessions ended',
    userId,
    tenantId: admin.tenant_id,
    resetBy: admin.id,
  });
}

// Clears a lockout early.
async function unlockUser(admin, userId) {
  await findManageable(admin, userId);

  await userModel.resetFailedLogins(userId);
  securityLog('info', 'auth.account.unlocked', {
    message: 'Account unlocked by an administrator',
    userId,
    tenantId: admin.tenant_id,
    unlockedBy: admin.id,
  });
}

module.exports = { createUser, listUsers, getUser, updateUser, resetPassword, unlockUser };
