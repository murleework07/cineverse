const { query } = require('../../config/db');
const { cache } = require('../../services/cache');
const rec = require('../../services/recommender');
const { mapMovie } = require('../movies/movies.service');

const MODEL_TTL = 10 * 60_000;

/** The CF model is O(items² · overlap) to build, so it's cached and rebuilt lazily. */
function getModel() {
  return cache.wrap('recs:model', async () => {
    const rows = await query('SELECT user_id AS userId, movie_id AS movieId, rating FROM reviews');
    return rec.buildModel(rows);
  }, MODEL_TTL);
}

function getCatalog() {
  return cache.wrap('recs:catalog', async () => {
    const rows = await query(
      `SELECT m.*, (SELECT GROUP_CONCAT(g.name ORDER BY g.name) FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id WHERE mg.movie_id = m.id) AS genres
       FROM movies m`);
    const [{ mean }] = await query('SELECT COALESCE(AVG(rating), 6.5) AS mean FROM reviews');
    const movies = rows.map(mapMovie);
    return { movies, globalMean: Number(mean), genresById: new Map(movies.map((m) => [m.id, m.genres])) };
  }, MODEL_TTL);
}

async function forUser(userId, limit = 12) {
  const [model, catalog, userRatings, wl] = await Promise.all([
    getModel(),
    getCatalog(),
    query('SELECT movie_id AS movieId, rating FROM reviews WHERE user_id = :userId', { userId }),
    query('SELECT movie_id AS movieId FROM watchlist WHERE user_id = :userId AND watched = 1', { userId }),
  ]);
  const exclude = new Set([...userRatings.map((r) => r.movieId), ...wl.map((w) => w.movieId)]);
  const cfScores = rec.predictForUser(model, userRatings);
  const affinity = rec.genreAffinity(userRatings, catalog.genresById);
  const data = rec.rank({ candidates: catalog.movies, cfScores, genreAffinity: affinity, globalMean: catalog.globalMean, limit, exclude });
  return { data, meta: { strategy: userRatings.length === 0 ? 'popularity' : 'hybrid-cf', basedOn: userRatings.length, modelBuiltAt: model.builtAt } };
}

async function similar(movieId, limit = 8) {
  const [model, catalog] = await Promise.all([getModel(), getCatalog()]);
  const byId = new Map(catalog.movies.map((m) => [m.id, m]));
  const target = byId.get(movieId);
  const cf = (model.sims.get(movieId) || []).map(([id, sim]) => ({ ...byId.get(id), similarity: Math.round(sim * 1000) / 1000 }));
  if (cf.length >= limit || !target) return cf.slice(0, limit);
  // backfill with genre (Jaccard) similarity when CF data is sparse
  const seen = new Set([movieId, ...cf.map((m) => m.id)]);
  const tg = new Set(target.genres);
  const content = catalog.movies
    .filter((m) => !seen.has(m.id))
    .map((m) => {
      const inter = m.genres.filter((g) => tg.has(g)).length;
      const union = new Set([...m.genres, ...tg]).size || 1;
      return { ...m, similarity: Math.round((inter / union) * 0.5 * 1000) / 1000 };
    })
    .filter((m) => m.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || b.avgRating - a.avgRating);
  return [...cf, ...content].slice(0, limit);
}

module.exports = { forUser, similar, getModel };
