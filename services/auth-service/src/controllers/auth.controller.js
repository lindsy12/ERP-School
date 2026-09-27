// Translates between HTTP and the auth service: read the request, call the logic, send the response.
const authService = require('../services/auth.service');
const { validateLogin, validateRefreshToken, validateUserId } = require('../validators/auth.validators');

async function login(req, res) {
  const credentials = validateLogin(req.body);
  const tokens = await authService.login(credentials);
  res.set('Cache-Control', 'no-store'); // never let a proxy or browser cache tokens
  res.json(tokens);
}

async function refresh(req, res) {
  const tokens = await authService.refresh(validateRefreshToken(req.body));
  res.set('Cache-Control', 'no-store');
  res.json(tokens);
}

async function logout(req, res) {
  await authService.logout(req.user.id, validateRefreshToken(req.body));
  res.status(204).end();
}

async function unlockUser(req, res) {
  await authService.unlockUser(req.user, validateUserId(req.params.id));
  res.status(204).end();
}

async function me(req, res) {
  res.json(await authService.getMe(req.user.id));
}

// For the gateway: who does this token belong to? Checks the database too, so a user who was
// disabled or deleted is rejected immediately, not only when their token expires.
async function verify(req, res) {
  const user = await authService.getMe(req.user.id);
  res.set('Cache-Control', 'no-store');
  res.json({ id: user.id, role: user.role, tenant_id: user.tenant_id });
}

module.exports = { login, refresh, logout, unlockUser, me, verify };
