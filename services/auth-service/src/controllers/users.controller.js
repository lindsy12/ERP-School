// HTTP side of account management by admins (routes/users.routes.js).
const usersService = require('../services/users.service');
const {
  validateUserId,
  validateCreateUser,
  validateUpdateUser,
  validateListQuery,
  validateResetPassword,
} = require('../validators/auth.validators');

async function create(req, res) {
  const user = await usersService.createUser(req.user, validateCreateUser(req.body));
  res.status(201).location(`/api/v1/auth/users/${user.id}`).json(user);
}

async function list(req, res) {
  res.json(await usersService.listUsers(req.user, validateListQuery(req.query)));
}

async function get(req, res) {
  res.json(await usersService.getUser(req.user, validateUserId(req.params.id)));
}

async function update(req, res) {
  const id = validateUserId(req.params.id);
  res.json(await usersService.updateUser(req.user, id, validateUpdateUser(req.body)));
}

async function resetPassword(req, res) {
  const id = validateUserId(req.params.id);
  await usersService.resetPassword(req.user, id, validateResetPassword(req.body));
  res.status(204).end();
}

async function unlock(req, res) {
  await usersService.unlockUser(req.user, validateUserId(req.params.id));
  res.status(204).end();
}

module.exports = { create, list, get, update, resetPassword, unlock };
