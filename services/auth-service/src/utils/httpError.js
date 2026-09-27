// An error that knows which HTTP status and machine-readable code to send.
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
