const router = require('express').Router();
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth, optionalAuth } = require('../../middleware/auth');
const ah = require('../../utils/asyncHandler');
const { track } = require('../../services/events');
const svc = require('./reviews.service');

const id = z.coerce.number().int().positive();
const pageSchema = z.object({
  sort: z.enum(['recent', 'top']).default('recent'),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(10),
  title: z.string().trim().max(150).optional(),
  body: z.string().trim().min(10, 'review must be at least 10 characters').max(10000),
  containsSpoilers: z.boolean().optional(),
});
const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) });

router.get('/movies/:movieId/reviews', optionalAuth, validate(z.object({ movieId: id }), 'params'), validate(pageSchema, 'query'),
  ah(async (req, res) => res.json(await svc.listForMovie(req.params.movieId, { ...req.query, viewerId: req.user?.id }))));

router.post('/movies/:movieId/reviews', requireAuth, validate(z.object({ movieId: id }), 'params'), validate(reviewSchema),
  ah(async (req, res) => {
    const review = await svc.create(req.user.id, req.params.movieId, req.body);
    track('review.created', { userId: req.user.id, entityType: 'movie', entityId: req.params.movieId, metadata: { rating: review.rating, sentiment: review.sentiment.label } });
    res.status(201).json({ data: review });
  }));

router.get('/reviews/recent', optionalAuth, validate(pageSchema, 'query'),
  ah(async (req, res) => res.json(await svc.listRecent({ ...req.query, viewerId: req.user?.id }))));

router.get('/reviews/feed', requireAuth, validate(pageSchema, 'query'),
  ah(async (req, res) => res.json(await svc.feed(req.user.id, req.query))));

router.get('/reviews/:id', optionalAuth, validate(z.object({ id }), 'params'),
  ah(async (req, res) => res.json({ data: await svc.getById(req.params.id, req.user?.id) })));

router.patch('/reviews/:id', requireAuth, validate(z.object({ id }), 'params'), validate(reviewSchema.partial()),
  ah(async (req, res) => res.json({ data: await svc.update(req.params.id, req.user, req.body) })));

router.delete('/reviews/:id', requireAuth, validate(z.object({ id }), 'params'), ah(async (req, res) => {
  await svc.remove(req.params.id, req.user);
  res.status(204).end();
}));

router.put('/reviews/:id/like', requireAuth, validate(z.object({ id }), 'params'), ah(async (req, res) => {
  const result = await svc.setLike(req.params.id, req.user.id, true);
  track('review.liked', { userId: req.user.id, entityType: 'review', entityId: req.params.id });
  res.json(result);
}));

router.delete('/reviews/:id/like', requireAuth, validate(z.object({ id }), 'params'),
  ah(async (req, res) => res.json(await svc.setLike(req.params.id, req.user.id, false))));

router.get('/reviews/:id/comments', validate(z.object({ id }), 'params'),
  ah(async (req, res) => res.json({ data: await svc.listComments(req.params.id) })));

router.post('/reviews/:id/comments', requireAuth, validate(z.object({ id }), 'params'), validate(commentSchema), ah(async (req, res) => {
  const comment = await svc.addComment(req.params.id, req.user.id, req.body.body);
  track('comment.created', { userId: req.user.id, entityType: 'review', entityId: req.params.id });
  res.status(201).json({ data: comment });
}));

module.exports = router;
