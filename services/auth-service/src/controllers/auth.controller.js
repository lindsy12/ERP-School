// Translates between HTTP and the auth service: read the request, call the logic, send the response.
const authService = require('../services/auth.service');
const { validateLogin, validateRefreshToken, validateChangePassword } = require('../validators/auth.validators');

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
  await authService.logout(req.user, req.accessToken, validateRefreshToken(req.body));
  res.status(204).end();
}

async function changePassword(req, res) {
  const tokens = await authService.changePassword(req.user, validateChangePassword(req.body));
  res.set('Cache-Control', 'no-store');
  res.json(tokens);
}

// req.user was read from the database by middleware/authenticate.js, so it is current.
async function me(req, res) {
  const { id, email, role, tenant_id: tenantId } = req.user;
  res.json({ id, email, role, tenant_id: tenantId });
}

// For the gateway: who does this token belong to? Rejects disabled or deleted users and revoked
// tokens immediately, not only when the token expires (see middleware/authenticate.js).
async function verify(req, res) {
  const { id, role, tenant_id: tenantId } = req.user;
  res.set('Cache-Control', 'no-store');
  res.json({ id, role, tenant_id: tenantId });
}

module.exports = { login, refresh, logout, changePassword, me, verify };
