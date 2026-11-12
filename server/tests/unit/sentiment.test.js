const { analyze } = require('../../src/services/sentiment');

describe('sentiment analyzer', () => {
  test('positive review', () => {
    const r = analyze('An absolute masterpiece, stunning visuals and brilliant acting.');
    expect(r.label).toBe('positive');
    expect(r.score).toBeGreaterThan(0.5);
  });

  test('negative review', () => {
    const r = analyze('Boring, predictable and a total waste of time.');
    expect(r.label).toBe('negative');
    expect(r.score).toBeLessThan(-0.5);
  });

  test('negation flips polarity', () => {
    expect(analyze('good').score).toBeGreaterThan(0);
    expect(analyze('not good').score).toBeLessThan(0);
  });

  test('intensifiers amplify', () => {
    expect(analyze('really great').score).toBeGreaterThan(analyze('great').score);
  });

  test('clause after "but" dominates', () => {
    expect(analyze('Great visuals but the story is boring and tedious').label).toBe('negative');
  });

  test('no opinion words is neutral', () => {
    expect(analyze('I watched it on Tuesday with my brother.')).toEqual({ score: 0, label: 'neutral' });
  });

  test('score is bounded to [-1, 1]', () => {
    const r = analyze('amazing '.repeat(200));
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
