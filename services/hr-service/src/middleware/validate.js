const HttpError = require('../utils/httpError');

// Wraps a Joi schema into Express middleware. Validates the given request
// property ('body' | 'query' | 'params') and throws VALIDATION_ERROR with a
// per-field details array — see CLAUDE.md's "HTTP conventions".
function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
    if (error) {
      const details = error.details.map((d) => ({ field: d.path.join('.'), message: d.message }));
      return next(new HttpError(400, 'VALIDATION_ERROR', 'Request is invalid', details));
    }
    req[property] = value;
    return next();
  };
}

module.exports = validate;
