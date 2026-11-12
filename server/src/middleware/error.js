const AppError = require('../utils/AppError');
const logger = require('../config/logger');

function notFound(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err.code === 'ER_DUP_ENTRY') {
    err = AppError.conflict('Resource already exists');
  }
  const status = err instanceof AppError ? err.status : 500;
  if (status >= 500) logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  res.status(status).json({
    error: {
      code: err instanceof AppError ? err.code : 'INTERNAL',
      message: status >= 500 ? 'Internal server error' : err.message,
      ...(err.details && { details: err.details }),
    },
  });
}

module.exports = { notFound, errorHandler };
