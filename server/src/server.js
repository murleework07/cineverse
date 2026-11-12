const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { pool } = require('./config/db');
const events = require('./services/events');

const server = app.listen(env.PORT, () => logger.info(`CineVerse API listening on :${env.PORT}`));

// Graceful shutdown: stop accepting connections, flush analytics, close the pool.
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await events.flush();
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
