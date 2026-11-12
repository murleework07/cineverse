const { query } = require('../../config/db');
const { cache } = require('../../services/cache');

/** Generates a gap-free date series with a recursive CTE so charts have no holes. */
const dateSeries = (days) => `
  WITH RECURSIVE d AS (
    SELECT CURDATE() - INTERVAL ${days - 1} DAY AS day
    UNION ALL SELECT day + INTERVAL 1 DAY FROM d WHERE day < CURDATE()
  )`;

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? Math.round((num / Math.sqrt(dx * dy)) * 1000) / 1000 : null;
}

async function overview(days) {
  const [[totals], [active], [growth]] = await Promise.all([
    query(`SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM movies) AS movies,
             (SELECT COUNT(*) FROM reviews) AS reviews, (SELECT ROUND(AVG(rating), 2) FROM reviews) AS avgRating,
             (SELECT COUNT(*) FROM comments) AS comments, (SELECT COUNT(*) FROM review_likes) AS likes`),
    // "active" = performed any tracked action or wrote a review in the window
    query(`SELECT
        COUNT(DISTINCT IF(t >= CURDATE(), u, NULL)) AS dau,
        COUNT(DISTINCT IF(t >= NOW() - INTERVAL 7 DAY, u, NULL)) AS wau,
        COUNT(DISTINCT IF(t >= NOW() - INTERVAL 30 DAY, u, NULL)) AS mau
      FROM (SELECT user_id AS u, created_at AS t FROM events WHERE user_id IS NOT NULL AND created_at >= NOW() - INTERVAL 30 DAY
            UNION ALL SELECT user_id, created_at FROM reviews WHERE created_at >= NOW() - INTERVAL 30 DAY) a`),
    query(`SELECT
        SUM(created_at >= NOW() - INTERVAL :days DAY) AS current,
        SUM(created_at <  NOW() - INTERVAL :days DAY AND created_at >= NOW() - INTERVAL :days2 DAY) AS previous
      FROM reviews WHERE created_at >= NOW() - INTERVAL :days2 DAY`, { days, days2: days * 2 }),
  ]);
  const cur = Number(growth.current || 0);
  const prev = Number(growth.previous || 0);
  return {
    ...totals,
    avgRating: Number(totals.avgRating || 0),
    dau: active.dau, wau: active.wau, mau: active.mau,
    stickiness: active.mau ? Math.round((active.dau / active.mau) * 1000) / 10 : 0,
    reviewsInPeriod: cur,
    reviewGrowthPct: prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null,
  };
}

function activity(days) {
  return query(`${dateSeries(days)}
    SELECT DATE_FORMAT(d.day, '%Y-%m-%d') AS date,
      (SELECT COUNT(*) FROM reviews r WHERE r.created_at >= d.day AND r.created_at < d.day + INTERVAL 1 DAY) AS reviews,
      (SELECT COUNT(*) FROM users u WHERE u.created_at >= d.day AND u.created_at < d.day + INTERVAL 1 DAY) AS signups,
      (SELECT COUNT(DISTINCT x.u) FROM (
          SELECT user_id AS u, created_at AS t FROM events WHERE user_id IS NOT NULL
          UNION ALL SELECT user_id, created_at FROM reviews) x
        WHERE x.t >= d.day AND x.t < d.day + INTERVAL 1 DAY) AS activeUsers,
      (SELECT ROUND(AVG(r.sentiment_score), 3) FROM reviews r WHERE r.created_at >= d.day AND r.created_at < d.day + INTERVAL 1 DAY) AS avgSentiment
    FROM d ORDER BY d.day`);
}

async function ratingDistribution() {
  const rows = await query('SELECT rating, COUNT(*) AS count FROM reviews GROUP BY rating');
  return Array.from({ length: 10 }, (_, i) => ({ rating: i + 1, count: rows.find((r) => r.rating === i + 1)?.count || 0 }));
}

function genres() {
  return query(`
    SELECT g.name AS genre, COUNT(r.id) AS reviews, ROUND(AVG(r.rating), 2) AS avgRating,
      ROUND(AVG(r.sentiment_score), 3) AS avgSentiment, COUNT(DISTINCT r.user_id) AS reviewers
    FROM genres g JOIN movie_genres mg ON mg.genre_id = g.id JOIN reviews r ON r.movie_id = mg.movie_id
    GROUP BY g.id ORDER BY reviews DESC`);
}

async function movies() {
  const [topRated, controversial, mostDiscussed] = await Promise.all([
    query(`SELECT id, title, avg_rating AS avgRating, review_count AS reviewCount,
             ROUND((review_count * avg_rating + 5 * (SELECT AVG(rating) FROM reviews)) / (review_count + 5), 2) AS weightedRating
           FROM movies WHERE review_count > 0 ORDER BY weightedRating DESC LIMIT 8`),
    // highest rating standard deviation = most divisive
    query(`SELECT m.id, m.title, ROUND(STDDEV_POP(r.rating), 2) AS stddev, ROUND(AVG(r.rating), 2) AS avgRating, COUNT(*) AS reviewCount
           FROM reviews r JOIN movies m ON m.id = r.movie_id GROUP BY m.id HAVING reviewCount >= 4
           ORDER BY stddev DESC LIMIT 8`),
    query(`SELECT m.id, m.title, SUM(r.comment_count) + SUM(r.like_count) AS engagement, COUNT(*) AS reviewCount
           FROM reviews r JOIN movies m ON m.id = r.movie_id GROUP BY m.id ORDER BY engagement DESC LIMIT 8`),
  ]);
  return { topRated, controversial, mostDiscussed };
}

async function sentiment() {
  const [labels, pairs, gaps] = await Promise.all([
    query('SELECT sentiment_label AS label, COUNT(*) AS count FROM reviews GROUP BY sentiment_label'),
    query('SELECT rating, sentiment_score AS s FROM reviews'),
    // reviews where text disagrees strongly with the star rating (useful for moderation / data quality)
    query(`SELECT r.id, r.rating, r.sentiment_score AS sentimentScore, LEFT(r.body, 140) AS excerpt, m.title AS movie
           FROM reviews r JOIN movies m ON m.id = r.movie_id
           WHERE (r.rating >= 8 AND r.sentiment_score <= -0.3) OR (r.rating <= 3 AND r.sentiment_score >= 0.3)
           ORDER BY ABS(r.rating / 10 - (r.sentiment_score + 1) / 2) DESC LIMIT 5`),
  ]);
  return {
    labels: Object.fromEntries(['positive', 'neutral', 'negative'].map((l) => [l, labels.find((x) => x.label === l)?.count || 0])),
    ratingSentimentCorrelation: pearson(pairs.map((p) => p.rating), pairs.map((p) => Number(p.s))),
    mismatches: gaps,
  };
}

async function engagement(days) {
  const [[funnel], searches, featureUsage] = await Promise.all([
    // Ordered funnel: each step only counts users who completed the previous step *before* it.
    query(`SELECT COUNT(*) AS viewed, COUNT(wl_at) AS watchlisted, SUM(rv_at IS NOT NULL AND wl_at IS NOT NULL) AS reviewed
      FROM (
        SELECT v.user_id, v.first_view,
          (SELECT MIN(created_at) FROM events w WHERE w.user_id = v.user_id AND w.type = 'watchlist.added' AND w.created_at >= v.first_view) AS wl_at,
          (SELECT MIN(created_at) FROM events r WHERE r.user_id = v.user_id AND r.type = 'review.created'
             AND r.created_at >= (SELECT MIN(created_at) FROM events w2 WHERE w2.user_id = v.user_id AND w2.type = 'watchlist.added' AND w2.created_at >= v.first_view)) AS rv_at
        FROM (SELECT user_id, MIN(created_at) AS first_view FROM events
              WHERE type = 'movie.view' AND user_id IS NOT NULL AND created_at >= NOW() - INTERVAL :days DAY GROUP BY user_id) v
      ) f`, { days }),
    query(`SELECT LOWER(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.q'))) AS term, COUNT(*) AS count
           FROM events WHERE type = 'search' AND created_at >= NOW() - INTERVAL :days DAY
           GROUP BY term ORDER BY count DESC LIMIT 10`, { days }),
    query(`SELECT type AS feature, COUNT(*) AS count, COUNT(DISTINCT user_id) AS users
           FROM events WHERE created_at >= NOW() - INTERVAL :days DAY GROUP BY type ORDER BY count DESC`, { days }),
  ]);
  return { funnel: { viewed: Number(funnel.viewed), watchlisted: Number(funnel.watchlisted), reviewed: Number(funnel.reviewed || 0) }, topSearches: searches, featureUsage };
}

function dashboard(days = 30) {
  return cache.wrap(`analytics:dashboard:${days}`, async () => {
    const [ov, act, dist, gen, mov, sen, eng] = await Promise.all([
      overview(days), activity(days), ratingDistribution(), genres(), movies(), sentiment(), engagement(days),
    ]);
    return {
      generatedAt: new Date().toISOString(), days,
      overview: ov, activity: act, ratingDistribution: dist, genres: gen, movies: mov, sentiment: sen, engagement: eng,
    };
  }, 60_000);
}

module.exports = { dashboard, pearson };
