// Services trust x-user-id / x-user-role because only the gateway is supposed to set them.
// So a client must never be able to send them: remove any x-user-* header on the way in.
// (When the gateway starts verifying JWTs, it will set these itself AFTER this runs.)
function stripIdentityHeaders(req, res, next) {
  for (const name of Object.keys(req.headers)) {
    if (name.startsWith('x-user-')) delete req.headers[name];
  }
  next();
}

module.exports = stripIdentityHeaders;
