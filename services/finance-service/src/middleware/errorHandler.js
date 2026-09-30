// Every error is { error: { code, message, details? } }. Unexpected errors are logged and hidden:
// their message may contain SQL or other internals.
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request body is not valid JSON" } });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: {
      code: err.code && status < 500 ? err.code : status >= 500 ? "INTERNAL_ERROR" : "ERROR",
      message: status >= 500 ? "Internal server error" : err.message,
      ...(err.details ? { details: err.details } : {})
    }
  });
};
