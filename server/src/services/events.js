/**
 * Fire-and-forget product analytics tracking. Writes are buffered and flushed
 * in batches so tracking never adds latency to user-facing requests.
 */
const { query } = require('../config/db');
const logger = require('../config/logger');

const buffer = [];
const FLUSH_SIZE = 50;
const FLUSH_MS = 2000;
let timer = null;

async function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await query(
      'INSERT INTO events (user_id, type, entity_type, entity_id, metadata, created_at) VALUES ?',
      [batch.map((e) => [e.userId, e.type, e.entityType, e.entityId, e.metadata && JSON.stringify(e.metadata), e.createdAt])],
    );
  } catch (err) {
    logger.warn({ err }, 'failed to flush analytics events');
  }
}

function track(type, { userId = null, entityType = null, entityId = null, metadata = null } = {}) {
  buffer.push({ type, userId, entityType, entityId, metadata, createdAt: new Date() });
  if (buffer.length >= FLUSH_SIZE) flush();
  else if (!timer) timer = setTimeout(flush, FLUSH_MS).unref();
}

module.exports = { track, flush };
