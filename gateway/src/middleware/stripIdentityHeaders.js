// Runs FIRST on every request.
//
// Services believe x-user-id / x-user-role / x-tenant-id without checking them, because only the
// gateway is supposed to set them (after verifying the token). If a client could send them itself,
// "x-user-role: SUPER_ADMIN" would make anyone a super admin, with no token at all. So every copy
// sent by a client is deleted here; middleware/authenticate.js sets the real values afterwards.
const IDENTITY_HEADERS = ['x-user-id', 'x-user-role', 'x-tenant-id'];

function stripIdentityHeaders(req, res, next) {
  for (const name of Object.keys(req.headers)) {
    // Also drop any other x-user-* header, in case services start reading new ones later.
    if (IDENTITY_HEADERS.includes(name) || name.startsWith('x-user-')) {
      delete req.headers[name];
    }
  }
  next();
}

module.exports = stripIdentityHeaders;
module.exports.IDENTITY_HEADERS = IDENTITY_HEADERS;
