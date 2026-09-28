module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: {
      code: err.code || "INTERNAL_ERROR",
      message: err.message || "Internal server error",
      ...(err.details ? { details: err.details } : {})
    }
  });
};
