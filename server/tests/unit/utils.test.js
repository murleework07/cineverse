const { TTLCache } = require('../../src/services/cache');
const { encodeCursor, decodeCursor } = require('../../src/utils/pagination');
const { pearson } = require('../../src/modules/analytics/analytics.service');
const { toBooleanQuery } = require('../../src/modules/movies/movies.service');

describe('TTLCache', () => {
  test('evicts least recently used beyond max', async () => {
    const c = new TTLCache({ max: 2 });
    await c.set('a', 1); await c.set('b', 2);
    await c.get('a'); // a is now most recent
    await c.set('c', 3);
    expect(await c.get('b')).toBeUndefined();
    expect(await c.get('a')).toBe(1);
  });

  test('expires entries after ttl', async () => {
    const c = new TTLCache({ ttlMs: 5 });
    await c.set('k', 'v');
    await new Promise((r) => setTimeout(r, 10));
    expect(await c.get('k')).toBeUndefined();
  });

  test('wrap computes once and tracks hit rate', async () => {
    const c = new TTLCache();
    const fn = jest.fn().mockResolvedValue(42);
    await c.wrap('x', fn); await c.wrap('x', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c.stats().hitRate).toBe(0.5);
  });

  test('delPrefix removes matching keys only', async () => {
    const c = new TTLCache();
    await c.set('recs:1', 1); await c.set('movies:1', 2);
    await c.delPrefix('recs:');
    expect(await c.get('recs:1')).toBeUndefined();
    expect(await c.get('movies:1')).toBe(2);
  });
});

test('cursor round-trips and rejects garbage', () => {
  expect(decodeCursor(encodeCursor({ v: 3, id: 9 }))).toEqual({ v: 3, id: 9 });
  expect(decodeCursor('%%%')).toBeNull();
});

test('pearson correlation', () => {
  expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBe(1);
  expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBe(-1);
  expect(pearson([1, 2], [1, 2])).toBeNull();
});

test('full-text query is sanitised against boolean operators', () => {
  expect(toBooleanQuery('dark +knight -"x" *')).toBe('+dark* +knight*');
});
