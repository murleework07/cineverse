const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const skip = () => env.NODE_ENV === 'test';

const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, skip });
const authLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many auth attempts, try again later' } },
});

module.exports = { apiLimiter, authLimiter };
