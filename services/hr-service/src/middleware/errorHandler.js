const HttpError = require('../utils/httpError');

const SEQUELIZE_VALIDATION = ['SequelizeValidationError', 'SequelizeUniqueConstraintError'];

function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// Turns any error thrown/passed to next() into our standard shape:
// { "error": { "code", "message", "details"? } } — see CLAUDE.md's "HTTP conventions".
// Must have 4 parameters so Express recognises it as an error handler.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (!(err instanceof HttpError)) {
    if (SEQUELIZE_VALIDATION.includes(err.name)) {
      const details = (err.errors || []).map((e) => ({ field: e.path, message: e.message }));
      error = new HttpError(400, 'VALIDATION_ERROR', 'Request body is invalid', details.length ? details : undefined);
    } else if (err.name === 'SequelizeForeignKeyConstraintError') {
      error = new HttpError(400, 'VALIDATION_ERROR', 'Referenced record does not exist');
    } else if (err.type === 'entity.parse.failed') {
      error = new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    } else if (err.type === 'entity.too.large') {
      error = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    } else {
      console.error(err);
      error = new HttpError(500, 'INTERNAL_ERROR', 'Internal server error');
    }
  }

  const body = { code: error.code, message: error.message };
  if (error.details) body.details = error.details;
  res.status(error.status).json({ error: body });
}

module.exports = { notFound, errorHandler };
