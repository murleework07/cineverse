const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Require a valid access token. */
function requireAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next(AppError.unauthorized());
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.user = { id: payload.sub, role: payload.role, username: payload.username };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
  }
}

/** Attach req.user if a valid token is present, but don't require it. */
function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
      req.user = { id: payload.sub, role: payload.role, username: payload.username };
    } catch { /* ignore */ }
  }
  next();
}

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) return next(AppError.forbidden());
  next();
};

module.exports = { requireAuth, optionalAuth, requireRole };
