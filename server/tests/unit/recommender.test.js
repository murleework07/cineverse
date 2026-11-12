const rec = require('../../src/services/recommender');

// Two taste clusters: users 1-3 love movies A,B and dislike C,D; users 4-6 the reverse.
const ratings = [];
for (const u of [1, 2, 3]) ratings.push({ userId: u, movieId: 'A', rating: 9 }, { userId: u, movieId: 'B', rating: 9 }, { userId: u, movieId: 'C', rating: 3 }, { userId: u, movieId: 'D', rating: 2 });
for (const u of [4, 5, 6]) ratings.push({ userId: u, movieId: 'A', rating: 2 }, { userId: u, movieId: 'B', rating: 3 }, { userId: u, movieId: 'C', rating: 9 }, { userId: u, movieId: 'D', rating: 9 });

describe('item-based collaborative filtering', () => {
  const model = rec.buildModel(ratings);

  test('items rated alike are similar, opposites are not neighbours', () => {
    const neighboursOfA = model.sims.get('A').map(([id]) => id);
    expect(neighboursOfA[0]).toBe('B');
    expect(neighboursOfA).not.toContain('C');
  });

  test('predicts high for unseen item in the user\'s cluster', () => {
    const preds = rec.predictForUser(model, [{ movieId: 'A', rating: 10 }, { movieId: 'C', rating: 2 }]);
    expect(preds.get('B').score).toBeGreaterThan(0);
    expect(preds.get('D').score).toBeLessThan(0);
  });

  test('empty history yields no CF predictions', () => {
    expect(rec.predictForUser(model, []).size).toBe(0);
  });

  test('cosine of disjoint vectors is 0', () => {
    expect(rec.cosine(new Map([[1, 1]]), new Map([[2, 1]]))).toBe(0);
  });
});

describe('ranking', () => {
  test('bayesian average pulls low-count items toward the mean', () => {
    expect(rec.bayesian(10, 1, 6)).toBeLessThan(rec.bayesian(9, 100, 6));
  });

  test('rank excludes seen items and orders by blended score', () => {
    const candidates = [
      { id: 1, avgRating: 9, reviewCount: 50, genres: ['Horror'] },
      { id: 2, avgRating: 7, reviewCount: 50, genres: ['Sci-Fi'] },
      { id: 3, avgRating: 8, reviewCount: 50, genres: ['Sci-Fi'] },
    ];
    const out = rec.rank({
      candidates, cfScores: new Map(), genreAffinity: new Map([['Sci-Fi', 1], ['Horror', -1]]),
      globalMean: 7, exclude: new Set([3]),
    });
    expect(out.map((m) => m.id)).toEqual([2, 1]);
    expect(out[0].reason).toMatch(/Sci-Fi/);
  });

  test('genre affinity reflects relative ratings', () => {
    const genres = new Map([[1, ['Horror']], [2, ['Comedy']]]);
    const aff = rec.genreAffinity([{ movieId: 1, rating: 10 }, { movieId: 2, rating: 2 }], genres);
    expect(aff.get('Horror')).toBeGreaterThan(aff.get('Comedy'));
  });
});
