function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

const SEQUELIZE_400_ERRORS = [
  'SequelizeValidationError',
  'SequelizeUniqueConstraintError',
  'SequelizeForeignKeyConstraintError',
];

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (SEQUELIZE_400_ERRORS.includes(err.name)) {
    const message = err.errors?.length
      ? err.errors.map((e) => e.message).join(', ')
      : 'Referenced record does not exist or violates a database constraint';
    return res.status(400).json({ error: message });
  }

  const status = err.status || 500;
  return res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = { notFound, errorHandler };
