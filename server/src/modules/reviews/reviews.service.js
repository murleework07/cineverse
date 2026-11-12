const { query, transaction } = require('../../config/db');
const AppError = require('../../utils/AppError');
const { encodeCursor, decodeCursor } = require('../../utils/pagination');
const { analyze } = require('../../services/sentiment');
const { cache } = require('../../services/cache');

const SELECT = `
  SELECT r.*, u.username, u.avatar_url, m.title AS movie_title, m.poster_url AS movie_poster
    {{liked}}
  FROM reviews r
  JOIN users u ON u.id = r.user_id
  JOIN movies m ON m.id = r.movie_id`;

function selectSql(viewerId) {
  return SELECT.replace('{{liked}}', viewerId
    ? ', EXISTS(SELECT 1 FROM review_likes l WHERE l.review_id = r.id AND l.user_id = :viewerId) AS liked_by_me'
    : ', 0 AS liked_by_me');
}

function mapReview(r) {
  return {
    id: r.id, rating: r.rating, title: r.title, body: r.body, containsSpoilers: !!r.contains_spoilers,
    sentiment: { score: Number(r.sentiment_score), label: r.sentiment_label },
    likeCount: r.like_count, commentCount: r.comment_count, likedByMe: !!r.liked_by_me,
    createdAt: r.created_at, updatedAt: r.updated_at,
    author: { id: r.user_id, username: r.username, avatarUrl: r.avatar_url },
    movie: { id: r.movie_id, title: r.movie_title, posterUrl: r.movie_poster },
  };
}

/**
 * Keyset pagination over (sortValue, id). `sort=recent` orders by created_at,
 * `sort=top` by like_count. Returns { data, nextCursor }.
 */
async function paginate({ where, params, sort = 'recent', cursor, limit = 10, viewerId }) {
  const col = sort === 'top' ? 'r.like_count' : 'r.created_at';
  const c = decodeCursor(cursor);
  const conds = [...where];
  const p = { ...params, viewerId, limit: limit + 1 };
  if (c) {
    conds.push(`(${col} < :cv OR (${col} = :cv AND r.id < :cid))`);
    p.cv = sort === 'top' ? c.v : new Date(c.v);
    p.cid = c.id;
  }
  const rows = await query(
    `${selectSql(viewerId)} ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
     ORDER BY ${col} DESC, r.id DESC LIMIT :limit`, p);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    data: page.map(mapReview),
    nextCursor: hasMore ? encodeCursor({ v: sort === 'top' ? last.like_count : last.created_at, id: last.id }) : null,
  };
}

function listForMovie(movieId, opts) {
  return paginate({ ...opts, where: ['r.movie_id = :movieId'], params: { movieId } });
}

function listForUser(userId, opts) {
  return paginate({ ...opts, where: ['r.user_id = :userId'], params: { userId } });
}

function listRecent(opts) {
  return paginate({ ...opts, where: [], params: {} });
}

/** Reviews written by people the viewer follows. */
function feed(viewerId, opts) {
  return paginate({
    ...opts, viewerId,
    where: ['r.user_id IN (SELECT followee_id FROM follows WHERE follower_id = :viewerId)'], params: {},
  });
}

async function getById(id, viewerId) {
  const [row] = await query(`${selectSql(viewerId)} WHERE r.id = :id`, { id, viewerId });
  if (!row) throw AppError.notFound('Review not found');
  return mapReview(row);
}

async function invalidate() {
  await Promise.all([cache.delPrefix('recs:'), cache.delPrefix('movies:'), cache.delPrefix('analytics:')]);
}

async function create(userId, movieId, { rating, title, body, containsSpoilers }) {
  const { score, label } = analyze(`${title || ''} ${body}`);
  const id = await transaction(async (tx) => {
    const [movie] = await tx.query('SELECT id FROM movies WHERE id = :movieId FOR UPDATE', { movieId });
    if (!movie) throw AppError.notFound('Movie not found');
    const [existing] = await tx.query('SELECT id FROM reviews WHERE user_id = :userId AND movie_id = :movieId', { userId, movieId });
    if (existing) throw AppError.conflict('You have already reviewed this movie');
    const r = await tx.query(
      `INSERT INTO reviews (user_id, movie_id, rating, title, body, contains_spoilers, sentiment_score, sentiment_label)
       VALUES (:userId, :movieId, :rating, :title, :body, :spoilers, :score, :label)`,
      { userId, movieId, rating, title: title || null, body, spoilers: !!containsSpoilers, score, label });
    await tx.query('UPDATE movies SET rating_sum = rating_sum + :rating, review_count = review_count + 1 WHERE id = :movieId', { rating, movieId });
    return r.insertId;
  });
  await invalidate();
  return getById(id, userId);
}

async function loadOwned(tx, id, user) {
  const [review] = await tx.query('SELECT * FROM reviews WHERE id = :id FOR UPDATE', { id });
  if (!review) throw AppError.notFound('Review not found');
  if (review.user_id !== user.id && user.role !== 'admin') throw AppError.forbidden('You can only modify your own reviews');
  return review;
}

async function update(id, user, data) {
  await transaction(async (tx) => {
    const review = await loadOwned(tx, id, user);
    const next = {
      rating: data.rating ?? review.rating,
      title: data.title !== undefined ? data.title : review.title,
      body: data.body ?? review.body,
      spoilers: data.containsSpoilers ?? !!review.contains_spoilers,
    };
    const { score, label } = analyze(`${next.title || ''} ${next.body}`);
    await tx.query(
      `UPDATE reviews SET rating = :rating, title = :title, body = :body, contains_spoilers = :spoilers,
         sentiment_score = :score, sentiment_label = :label WHERE id = :id`, { ...next, score, label, id });
    if (next.rating !== review.rating) {
      await tx.query('UPDATE movies SET rating_sum = rating_sum + :delta WHERE id = :movieId',
        { delta: next.rating - review.rating, movieId: review.movie_id });
    }
  });
  await invalidate();
  return getById(id, user.id);
}

async function remove(id, user) {
  await transaction(async (tx) => {
    const review = await loadOwned(tx, id, user);
    await tx.query('DELETE FROM reviews WHERE id = :id', { id });
    await tx.query('UPDATE movies SET rating_sum = rating_sum - :rating, review_count = review_count - 1 WHERE id = :movieId',
      { rating: review.rating, movieId: review.movie_id });
  });
  await invalidate();
}

/** Idempotent like / unlike. like_count only changes when a row is actually inserted/deleted. */
async function setLike(id, userId, liked) {
  return transaction(async (tx) => {
    const [review] = await tx.query('SELECT id FROM reviews WHERE id = :id FOR UPDATE', { id });
    if (!review) throw AppError.notFound('Review not found');
    const r = liked
      ? await tx.query('INSERT IGNORE INTO review_likes (user_id, review_id) VALUES (:userId, :id)', { userId, id })
      : await tx.query('DELETE FROM review_likes WHERE user_id = :userId AND review_id = :id', { userId, id });
    if (r.affectedRows) {
      await tx.query(`UPDATE reviews SET like_count = like_count ${liked ? '+' : '-'} 1 WHERE id = :id`, { id });
    }
    const [{ like_count: likeCount }] = await tx.query('SELECT like_count FROM reviews WHERE id = :id', { id });
    return { likeCount, likedByMe: liked };
  });
}

async function listComments(reviewId) {
  const rows = await query(
    `SELECT c.*, u.username, u.avatar_url FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.review_id = :reviewId ORDER BY c.created_at ASC, c.id ASC LIMIT 200`, { reviewId });
  return rows.map((c) => ({ id: c.id, body: c.body, createdAt: c.created_at, author: { id: c.user_id, username: c.username, avatarUrl: c.avatar_url } }));
}

async function addComment(reviewId, userId, body) {
  const id = await transaction(async (tx) => {
    const [review] = await tx.query('SELECT id FROM reviews WHERE id = :reviewId FOR UPDATE', { reviewId });
    if (!review) throw AppError.notFound('Review not found');
    const r = await tx.query('INSERT INTO comments (review_id, user_id, body) VALUES (:reviewId, :userId, :body)', { reviewId, userId, body });
    await tx.query('UPDATE reviews SET comment_count = comment_count + 1 WHERE id = :reviewId', { reviewId });
    return r.insertId;
  });
  return (await listComments(reviewId)).find((c) => c.id === id);
}

module.exports = { listForMovie, listForUser, listRecent, feed, getById, create, update, remove, setLike, listComments, addComment };
