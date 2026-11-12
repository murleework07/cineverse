const router = require('express').Router();
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth, optionalAuth, requireRole } = require('../../middleware/auth');
const ah = require('../../utils/asyncHandler');
const { track } = require('../../services/events');
const svc = require('./movies.service');

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  genre: z.string().max(50).optional(),
  yearFrom: z.coerce.number().int().min(1870).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1870).max(2100).optional(),
  minRating: z.coerce.number().min(0).max(10).optional(),
  sort: z.enum(['popular', 'top_rated', 'newest', 'title', 'relevance']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const movieSchema = z.object({
  title: z.string().trim().min(1).max(255),
  overview: z.string().max(5000).optional(),
  director: z.string().max(255).optional(),
  releaseYear: z.number().int().min(1870).max(2100).optional(),
  runtimeMin: z.number().int().min(1).max(1000).optional(),
  posterUrl: z.string().url().optional(),
  genres: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

router.get('/', optionalAuth, validate(listSchema, 'query'), ah(async (req, res) => {
  if (req.query.q) track('search', { userId: req.user?.id, metadata: { q: req.query.q } });
  res.json(await svc.list(req.query));
}));

router.get('/genres', ah(async (_req, res) => res.json({ data: await svc.genres() })));

router.get('/trending', ah(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 30);
  res.json({ data: await svc.trending(limit) });
}));

router.get('/:id', optionalAuth, validate(idParam, 'params'), ah(async (req, res) => {
  track('movie.view', { userId: req.user?.id, entityType: 'movie', entityId: req.params.id });
  res.json({ data: await svc.getById(req.params.id, req.user?.id) });
}));

router.post('/', requireAuth, requireRole('admin'), validate(movieSchema), ah(async (req, res) => {
  res.status(201).json({ data: await svc.create(req.body) });
}));

router.patch('/:id', requireAuth, requireRole('admin'), validate(idParam, 'params'), validate(movieSchema.partial()), ah(async (req, res) => {
  res.json({ data: await svc.update(req.params.id, req.body) });
}));

router.delete('/:id', requireAuth, requireRole('admin'), validate(idParam, 'params'), ah(async (req, res) => {
  await svc.remove(req.params.id);
  res.status(204).end();
}));

module.exports = router;
