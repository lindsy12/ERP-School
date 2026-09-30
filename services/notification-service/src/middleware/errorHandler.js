const HttpError = require('../utils/httpError');

// Turns any error thrown in a route into { error: { code, message, details? } }.
// Must have 4 parameters so Express recognises it as an error handler.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;
  if (!(err instanceof HttpError)) {
    if (err.type === 'entity.parse.failed') {
      error = new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    } else {
      console.error(err);
      error = new HttpError(500, 'INTERNAL_ERROR', 'Internal server error');
    }
  }
  const body = { code: error.code, message: error.message };
  if (error.details) body.details = error.details;
  res.status(error.status).json({ error: body });
}

module.exports = errorHandler;
