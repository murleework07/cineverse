const AppError = require('../utils/AppError');

/**
 * Validate req[source] against a zod schema; replaces it with the parsed
 * (coerced, defaulted) value.
 */
module.exports = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(AppError.badRequest('Validation failed', result.error.flatten().fieldErrors));
  }
  // req.query is a getter in Express 5; assign via defineProperty for forward-compat
  Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
  next();
};
