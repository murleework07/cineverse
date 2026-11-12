/**
 * In-process TTL + LRU cache. Exposes an async interface so it can be swapped
 * for Redis without touching callers.
 */
class TTLCache {
  constructor({ max = 500, ttlMs = 60_000 } = {}) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  async get(key) {
    const entry = this.map.get(key);
    if (!entry || entry.expires < Date.now()) {
      if (entry) this.map.delete(key);
      this.misses++;
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value;
  }

  async set(key, value, ttlMs = this.ttlMs) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
  }

  async delPrefix(prefix) {
    for (const key of this.map.keys()) if (key.startsWith(prefix)) this.map.delete(key);
  }

  async wrap(key, fn, ttlMs) {
    const cached = await this.get(key);
    if (cached !== undefined) return cached;
    const value = await fn();
    await this.set(key, value, ttlMs);
    return value;
  }

  stats() {
    const total = this.hits + this.misses;
    return { size: this.map.size, hits: this.hits, misses: this.misses, hitRate: total ? this.hits / total : 0 };
  }

  clear() { this.map.clear(); this.hits = 0; this.misses = 0; }
}

module.exports = { TTLCache, cache: new TTLCache({ max: 1000, ttlMs: 60_000 }) };
