class AppError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(msg, details) { return new AppError(400, msg, 'BAD_REQUEST', details); }
  static unauthorized(msg = 'Authentication required') { return new AppError(401, msg, 'UNAUTHORIZED'); }
  static forbidden(msg = 'Forbidden') { return new AppError(403, msg, 'FORBIDDEN'); }
  static notFound(msg = 'Not found') { return new AppError(404, msg, 'NOT_FOUND'); }
  static conflict(msg) { return new AppError(409, msg, 'CONFLICT'); }
}
module.exports = AppError;
