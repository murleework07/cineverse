const router = require('express').Router();
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth, optionalAuth } = require('../../middleware/auth');
const ah = require('../../utils/asyncHandler');
const { track } = require('../../services/events');
const svc = require('./users.service');
const reviews = require('../reviews/reviews.service');

const username = z.object({ username: z.string().min(1).max(30) });

router.patch('/me', requireAuth, validate(z.object({
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().max(500).optional(),
})), ah(async (req, res) => res.json({ user: await svc.updateMe(req.user.id, req.body) })));

router.get('/me/taste-matches', requireAuth, ah(async (req, res) => res.json({ data: await svc.tasteMatches(req.user.id) })));

router.get('/:username', optionalAuth, validate(username, 'params'),
  ah(async (req, res) => res.json({ data: await svc.profile(req.params.username, req.user?.id) })));

router.get('/:username/reviews', optionalAuth, validate(username, 'params'), ah(async (req, res) => {
  const userId = await svc.idFor(req.params.username);
  res.json(await reviews.listForUser(userId, {
    sort: req.query.sort === 'top' ? 'top' : 'recent', cursor: req.query.cursor, limit: 10, viewerId: req.user?.id,
  }));
}));

router.put('/:username/follow', requireAuth, validate(username, 'params'), ah(async (req, res) => {
  await svc.follow(req.user.id, req.params.username);
  track('user.followed', { userId: req.user.id, metadata: { username: req.params.username } });
  res.status(204).end();
}));

router.delete('/:username/follow', requireAuth, validate(username, 'params'), ah(async (req, res) => {
  await svc.unfollow(req.user.id, req.params.username);
  res.status(204).end();
}));

module.exports = router;
