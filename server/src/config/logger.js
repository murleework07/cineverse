const pino = require('pino');
const env = require('./env');

module.exports = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
