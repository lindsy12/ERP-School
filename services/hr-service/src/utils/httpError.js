// Mirrors services/auth-service/src/utils/httpError.js so every service in the
// system reports errors the same way — see CLAUDE.md's "HTTP conventions".
// Throw it anywhere in a route; middleware/errorHandler.js turns it into:
//   { "error": { "code": "...", "message": "...", "details": [...] } }
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = HttpError;
