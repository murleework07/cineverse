/**
 * Hybrid recommendation engine.
 *
 * 1. Item-based collaborative filtering: ratings are mean-centred per user,
 *    item-item cosine similarity is computed over co-rating users, and a
 *    user's score for an unseen item is the similarity-weighted average of
 *    their centred ratings for the k most similar items they've rated.
 * 2. Content signal: genre affinity built from the user's highly-rated movies.
 * 3. Popularity prior (Bayesian average) for cold-start users.
 *
 * The pure functions below are DB-agnostic and unit tested; the model is
 * rebuilt lazily and cached, and invalidated when reviews change.
 */

/** ratings: [{userId, movieId, rating}] -> Map<movieId, Map<userId, centredRating>> */
function buildItemVectors(ratings) {
  const byUser = new Map();
  for (const r of ratings) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId).push(r);
  }
  const items = new Map();
  for (const [userId, list] of byUser) {
    const mean = list.reduce((s, r) => s + r.rating, 0) / list.length;
    for (const r of list) {
      if (!items.has(r.movieId)) items.set(r.movieId, new Map());
      items.get(r.movieId).set(userId, r.rating - mean);
    }
  }
  return items;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0, overlap = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [u, va] of small) {
    const vb = large.get(u);
    if (vb !== undefined) { dot += va * vb; overlap++; }
  }
  if (overlap === 0) return 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  // shrink similarities computed from few co-raters (significance weighting)
  const shrink = overlap / (overlap + 3);
  return (dot / Math.sqrt(na * nb)) * shrink;
}

/** Map<movieId, Array<[otherId, sim]>> top-N neighbours per item */
function buildSimilarity(items, topN = 30) {
  const ids = [...items.keys()];
  const sims = new Map(ids.map((id) => [id, []]));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const s = cosine(items.get(ids[i]), items.get(ids[j]));
      if (s > 0) {
        sims.get(ids[i]).push([ids[j], s]);
        sims.get(ids[j]).push([ids[i], s]);
      }
    }
  }
  for (const [id, list] of sims) sims.set(id, list.sort((a, b) => b[1] - a[1]).slice(0, topN));
  return sims;
}

function buildModel(ratings) {
  const items = buildItemVectors(ratings);
  return { items, sims: buildSimilarity(items), builtAt: new Date().toISOString() };
}

/** Predict centred CF scores for every candidate the user hasn't rated. */
function predictForUser(model, userRatings, k = 20) {
  const rated = new Map(userRatings.map((r) => [r.movieId, r.rating]));
  if (rated.size === 0) return new Map();
  const mean = [...rated.values()].reduce((a, b) => a + b, 0) / rated.size;
  const num = new Map();
  const den = new Map();
  for (const [movieId, rating] of rated) {
    const neighbours = (model.sims.get(movieId) || []).slice(0, k);
    for (const [cand, sim] of neighbours) {
      if (rated.has(cand)) continue;
      num.set(cand, (num.get(cand) || 0) + sim * (rating - mean));
      den.set(cand, (den.get(cand) || 0) + Math.abs(sim));
    }
  }
  const out = new Map();
  for (const [cand, n] of num) out.set(cand, { score: n / den.get(cand), support: den.get(cand) });
  return out;
}

/** Bayesian average: pulls low-count movies toward the global mean. */
function bayesian(avg, count, globalMean, m = 5) {
  return (count * avg + m * globalMean) / (count + m);
}

/**
 * Blend signals into a final ranked list.
 * candidates: [{id, avgRating, reviewCount, genres:[...]}]
 */
function rank({ candidates, cfScores, genreAffinity, globalMean, limit = 20, exclude = new Set() }) {
  const scored = [];
  for (const m of candidates) {
    if (exclude.has(m.id)) continue;
    const pop = bayesian(m.avgRating, m.reviewCount, globalMean) / 10; // 0..1
    const cf = cfScores.get(m.id);
    const cfNorm = cf ? Math.max(-1, Math.min(1, cf.score / 3)) : 0; // centred rating / 3 → ~[-1,1]
    const genre = m.genres.length
      ? m.genres.reduce((s, g) => s + (genreAffinity.get(g) || 0), 0) / m.genres.length
      : 0;
    const confidence = cf ? Math.min(1, cf.support / 2) : 0;
    const score = 0.55 * confidence * cfNorm + 0.25 * genre + 0.2 * pop;
    const reason = cf && confidence > 0.3 && cfNorm > 0
      ? 'Because people with similar taste loved it'
      : genre > 0.3 ? `Matches your taste in ${m.genres.filter((g) => genreAffinity.get(g) > 0.3).slice(0, 2).join(' & ') || m.genres[0]}`
        : 'Highly rated by the community';
    scored.push({ ...m, score: Math.round(score * 1000) / 1000, reason });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Genre affinity in [-1,1] from a user's ratings relative to their mean. */
function genreAffinity(userRatings, movieGenres) {
  if (userRatings.length === 0) return new Map();
  const mean = userRatings.reduce((s, r) => s + r.rating, 0) / userRatings.length;
  const sum = new Map();
  const cnt = new Map();
  for (const r of userRatings) {
    for (const g of movieGenres.get(r.movieId) || []) {
      sum.set(g, (sum.get(g) || 0) + (r.rating - mean + 1)); // +1: rating a genre at all is a mild signal
      cnt.set(g, (cnt.get(g) || 0) + 1);
    }
  }
  const out = new Map();
  for (const [g, s] of sum) out.set(g, Math.max(-1, Math.min(1, s / cnt.get(g) / 3)));
  return out;
}

module.exports = { buildItemVectors, cosine, buildSimilarity, buildModel, predictForUser, bayesian, rank, genreAffinity };
