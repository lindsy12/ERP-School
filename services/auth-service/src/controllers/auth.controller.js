// Translates between HTTP and the auth service: read the request, call the logic, send the response.
const authService = require('../services/auth.service');
const { validateLogin } = require('../validators/auth.validators');

async function login(req, res) {
  const credentials = validateLogin(req.body);
  const tokens = await authService.login(credentials);
  res.set('Cache-Control', 'no-store'); // never let a proxy or browser cache tokens
  res.json(tokens);
}

async function me(req, res) {
  res.json(await authService.getMe(req.user.id));
}

module.exports = { login, me };
