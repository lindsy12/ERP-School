// Wraps a Joi schema into Express middleware. Validates the given request
// property ('body' | 'query' | 'params') and returns 400 with the readable
// Joi message on failure instead of letting bad input reach a controller.
function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.details.map((d) => d.message).join(', ') });
    }
    req[property] = value;
    return next();
  };
}

module.exports = validate;
