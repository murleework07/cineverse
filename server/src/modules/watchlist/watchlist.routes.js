const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../../config/db');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const ah = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { track } = require('../../services/events');
const { mapMovie } = require('../movies/movies.service');

router.use(requireAuth);
const movieId = z.object({ movieId: z.coerce.number().int().positive() });

router.get('/', ah(async (req, res) => {
  const rows = await query(
    `SELECT m.*, w.watched, w.added_at,
       (SELECT GROUP_CONCAT(g.name ORDER BY g.name) FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id WHERE mg.movie_id = m.id) AS genres
     FROM watchlist w JOIN movies m ON m.id = w.movie_id
     WHERE w.user_id = :userId ORDER BY w.watched ASC, w.added_at DESC`, { userId: req.user.id });
  res.json({ data: rows.map((r) => ({ ...mapMovie(r), watched: !!r.watched, addedAt: r.added_at })) });
}));

router.put('/:movieId', validate(movieId, 'params'), validate(z.object({ watched: z.boolean().default(false) })), ah(async (req, res) => {
  const [m] = await query('SELECT id FROM movies WHERE id = :id', { id: req.params.movieId });
  if (!m) throw AppError.notFound('Movie not found');
  await query(
    `INSERT INTO watchlist (user_id, movie_id, watched) VALUES (:userId, :movieId, :watched)
     ON DUPLICATE KEY UPDATE watched = VALUES(watched)`,
    { userId: req.user.id, movieId: req.params.movieId, watched: req.body.watched });
  track('watchlist.added', { userId: req.user.id, entityType: 'movie', entityId: req.params.movieId });
  res.json({ movieId: req.params.movieId, watched: req.body.watched, inWatchlist: true });
}));

router.delete('/:movieId', validate(movieId, 'params'), ah(async (req, res) => {
  await query('DELETE FROM watchlist WHERE user_id = :userId AND movie_id = :movieId', { userId: req.user.id, movieId: req.params.movieId });
  res.status(204).end();
}));

module.exports = router;
