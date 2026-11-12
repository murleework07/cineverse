const { query, transaction } = require('../../config/db');
const AppError = require('../../utils/AppError');
const { cache } = require('../../services/cache');

const SORTS = {
  popular: 'm.review_count DESC, m.avg_rating DESC',
  top_rated: '(m.review_count * m.avg_rating + 5 * 6.5) / (m.review_count + 5) DESC', // Bayesian average
  newest: 'm.release_year DESC, m.id DESC',
  title: 'm.title ASC',
  relevance: 'relevance DESC',
};

function mapMovie(r) {
  return {
    id: r.id, title: r.title, overview: r.overview, director: r.director, releaseYear: r.release_year,
    runtimeMin: r.runtime_min, posterUrl: r.poster_url, avgRating: Number(r.avg_rating), reviewCount: r.review_count,
    genres: r.genres ? r.genres.split(',') : [],
  };
}

/** Convert free text to a safe MySQL boolean-mode query: `+term*` for each word. */
function toBooleanQuery(q) {
  return q.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 2).map((w) => `+${w}*`).join(' ');
}

async function list({ q, genre, yearFrom, yearTo, minRating, sort, page, limit }) {
  const where = [];
  const params = { limit, offset: (page - 1) * limit };
  let relevance = '0';

  const boolQ = q ? toBooleanQuery(q) : '';
  if (boolQ) {
    where.push('MATCH(m.title, m.overview, m.director) AGAINST (:q IN BOOLEAN MODE)');
    relevance = 'MATCH(m.title, m.overview, m.director) AGAINST (:q IN BOOLEAN MODE) + (m.title LIKE :prefix) * 5';
    params.q = boolQ;
    params.prefix = `${q}%`;
  }
  if (genre) {
    where.push('EXISTS (SELECT 1 FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id WHERE mg.movie_id = m.id AND g.name = :genre)');
    params.genre = genre;
  }
  if (yearFrom) { where.push('m.release_year >= :yearFrom'); params.yearFrom = yearFrom; }
  if (yearTo) { where.push('m.release_year <= :yearTo'); params.yearTo = yearTo; }
  if (minRating) { where.push('m.avg_rating >= :minRating'); params.minRating = minRating; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = SORTS[sort === 'relevance' && !boolQ ? 'popular' : sort];

  const [rows, [{ total }]] = await Promise.all([
    query(
      `SELECT m.*, ${relevance} AS relevance,
         (SELECT GROUP_CONCAT(g.name ORDER BY g.name) FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id WHERE mg.movie_id = m.id) AS genres
       FROM movies m ${whereSql}
       ORDER BY ${orderBy}, m.id ASC
       LIMIT :limit OFFSET :offset`, params),
    query(`SELECT COUNT(*) AS total FROM movies m ${whereSql}`, params),
  ]);
  return { data: rows.map(mapMovie), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getById(id, userId) {
  const [row] = await query(
    `SELECT m.*, (SELECT GROUP_CONCAT(g.name ORDER BY g.name) FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id WHERE mg.movie_id = m.id) AS genres
     FROM movies m WHERE m.id = :id`, { id });
  if (!row) throw AppError.notFound('Movie not found');
  const movie = mapMovie(row);

  const [histogram, sentiment] = await Promise.all([
    query('SELECT rating, COUNT(*) AS count FROM reviews WHERE movie_id = :id GROUP BY rating', { id }),
    query('SELECT sentiment_label AS label, COUNT(*) AS count FROM reviews WHERE movie_id = :id GROUP BY sentiment_label', { id }),
  ]);
  movie.ratingHistogram = Array.from({ length: 10 }, (_, i) => ({ rating: i + 1, count: histogram.find((h) => h.rating === i + 1)?.count || 0 }));
  movie.sentiment = Object.fromEntries(['positive', 'neutral', 'negative'].map((l) => [l, sentiment.find((s) => s.label === l)?.count || 0]));

  if (userId) {
    const [[myReview], [wl]] = await Promise.all([
      query('SELECT id, rating FROM reviews WHERE movie_id = :id AND user_id = :userId', { id, userId }),
      query('SELECT watched FROM watchlist WHERE movie_id = :id AND user_id = :userId', { id, userId }),
    ]);
    movie.viewer = { reviewId: myReview?.id || null, rating: myReview?.rating || null, inWatchlist: !!wl, watched: !!wl?.watched };
  }
  return movie;
}

async function setGenres(tx, movieId, genres) {
  await tx.query('DELETE FROM movie_genres WHERE movie_id = :movieId', { movieId });
  for (const name of genres) {
    await tx.query('INSERT IGNORE INTO genres (name) VALUES (:name)', { name });
    await tx.query('INSERT INTO movie_genres (movie_id, genre_id) SELECT :movieId, id FROM genres WHERE name = :name', { movieId, name });
  }
}

async function create(data) {
  const id = await transaction(async (tx) => {
    const r = await tx.query(
      `INSERT INTO movies (title, overview, director, release_year, runtime_min, poster_url)
       VALUES (:title, :overview, :director, :releaseYear, :runtimeMin, :posterUrl)`,
      { overview: null, director: null, releaseYear: null, runtimeMin: null, posterUrl: null, ...data });
    await setGenres(tx, r.insertId, data.genres || []);
    return r.insertId;
  });
  await cache.delPrefix('movies:');
  return getById(id);
}

async function update(id, data) {
  await transaction(async (tx) => {
    const cols = { title: 'title', overview: 'overview', director: 'director', releaseYear: 'release_year', runtimeMin: 'runtime_min', posterUrl: 'poster_url' };
    const sets = Object.keys(cols).filter((k) => data[k] !== undefined).map((k) => `${cols[k]} = :${k}`);
    if (sets.length) {
      const r = await tx.query(`UPDATE movies SET ${sets.join(', ')} WHERE id = :id`, { ...data, id });
      if (r.affectedRows === 0) throw AppError.notFound('Movie not found');
    }
    if (data.genres) await setGenres(tx, id, data.genres);
  });
  await cache.delPrefix('movies:');
  return getById(id);
}

async function remove(id) {
  const r = await query('DELETE FROM movies WHERE id = :id', { id });
  if (r.affectedRows === 0) throw AppError.notFound('Movie not found');
  await cache.delPrefix('movies:');
}

function genres() {
  return cache.wrap('movies:genres', () => query(
    `SELECT g.name, COUNT(mg.movie_id) AS movieCount FROM genres g
     LEFT JOIN movie_genres mg ON mg.genre_id = g.id GROUP BY g.id ORDER BY g.name`), 300_000);
}

/** Trending = weighted recent engagement (reviews, likes, watchlist adds) over 7 days. */
function trending(limit = 10) {
  return cache.wrap(`movies:trending:${limit}`, async () => {
    const rows = await query(
      `SELECT m.*, t.score,
         (SELECT GROUP_CONCAT(g.name ORDER BY g.name) FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id WHERE mg.movie_id = m.id) AS genres
       FROM (
         SELECT movie_id, SUM(w) AS score FROM (
           SELECT movie_id, 3 AS w FROM reviews WHERE created_at >= NOW() - INTERVAL 7 DAY
           UNION ALL
           SELECT r.movie_id, 1 FROM review_likes l JOIN reviews r ON r.id = l.review_id WHERE l.created_at >= NOW() - INTERVAL 7 DAY
           UNION ALL
           SELECT movie_id, 2 FROM watchlist WHERE added_at >= NOW() - INTERVAL 7 DAY
         ) e GROUP BY movie_id
       ) t JOIN movies m ON m.id = t.movie_id
       ORDER BY t.score DESC, m.avg_rating DESC LIMIT :limit`, { limit });
    return rows.map((r) => ({ ...mapMovie(r), trendScore: Number(r.score) }));
  }, 60_000);
}

module.exports = { list, getById, create, update, remove, genres, trending, mapMovie, toBooleanQuery };
