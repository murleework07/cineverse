const { query } = require('../../config/db');
const AppError = require('../../utils/AppError');
const { publicUser } = require('../auth/auth.service');

async function profile(username, viewerId) {
  const [u] = await query(
    `SELECT u.*,
       (SELECT COUNT(*) FROM reviews WHERE user_id = u.id) AS review_count,
       (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE user_id = u.id) AS avg_rating_given,
       (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS followers,
       (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following,
       (SELECT COALESCE(SUM(like_count), 0) FROM reviews WHERE user_id = u.id) AS likes_received
       ${viewerId ? ', EXISTS(SELECT 1 FROM follows WHERE follower_id = :viewerId AND followee_id = u.id) AS is_following' : ''}
     FROM users u WHERE u.username = :username`, { username, viewerId });
  if (!u) throw AppError.notFound('User not found');
  const topGenres = await query(
    `SELECT g.name, COUNT(*) AS count, ROUND(AVG(r.rating), 1) AS avgRating
     FROM reviews r JOIN movie_genres mg ON mg.movie_id = r.movie_id JOIN genres g ON g.id = mg.genre_id
     WHERE r.user_id = :id GROUP BY g.id ORDER BY count DESC, avgRating DESC LIMIT 5`, { id: u.id });
  const { email, ...rest } = publicUser(u); // never expose another user's email
  return {
    ...rest,
    ...(viewerId === u.id && { email }),
    stats: {
      reviewCount: u.review_count, avgRatingGiven: u.avg_rating_given ? Number(u.avg_rating_given) : null,
      followers: u.followers, following: u.following, likesReceived: Number(u.likes_received),
    },
    topGenres,
    isFollowing: !!u.is_following,
  };
}

async function updateMe(userId, { bio, avatarUrl }) {
  await query('UPDATE users SET bio = COALESCE(:bio, bio), avatar_url = COALESCE(:avatarUrl, avatar_url) WHERE id = :userId',
    { bio: bio ?? null, avatarUrl: avatarUrl ?? null, userId });
  const [u] = await query('SELECT * FROM users WHERE id = :userId', { userId });
  return publicUser(u);
}

async function idFor(username) {
  const [u] = await query('SELECT id FROM users WHERE username = :username', { username });
  if (!u) throw AppError.notFound('User not found');
  return u.id;
}

async function follow(followerId, username) {
  const followeeId = await idFor(username);
  if (followeeId === followerId) throw AppError.badRequest('You cannot follow yourself');
  await query('INSERT IGNORE INTO follows (follower_id, followee_id) VALUES (:followerId, :followeeId)', { followerId, followeeId });
}

async function unfollow(followerId, username) {
  const followeeId = await idFor(username);
  await query('DELETE FROM follows WHERE follower_id = :followerId AND followee_id = :followeeId', { followerId, followeeId });
}

/** Users whose ratings correlate most with the viewer's (Pearson over co-rated movies). */
async function tasteMatches(userId, limit = 5) {
  return query(
    `SELECT u.username, u.avatar_url AS avatarUrl, s.n AS sharedMovies,
       ROUND((s.n * s.sxy - s.sx * s.sy) / NULLIF(SQRT((s.n * s.sxx - s.sx * s.sx) * (s.n * s.syy - s.sy * s.sy)), 0), 3) AS correlation
     FROM (
       SELECT b.user_id, COUNT(*) AS n, SUM(a.rating) AS sx, SUM(b.rating) AS sy,
              SUM(a.rating * b.rating) AS sxy, SUM(a.rating * a.rating) AS sxx, SUM(b.rating * b.rating) AS syy
       FROM reviews a JOIN reviews b ON a.movie_id = b.movie_id AND b.user_id <> a.user_id
       WHERE a.user_id = :userId GROUP BY b.user_id HAVING n >= 3
     ) s JOIN users u ON u.id = s.user_id
     WHERE u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = :userId)
     HAVING correlation IS NOT NULL
     ORDER BY correlation DESC, sharedMovies DESC LIMIT :limit`, { userId, limit });
}

module.exports = { profile, updateMe, follow, unfollow, tasteMatches, idFor };
