const router = require('express').Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const ah = require('../../utils/asyncHandler');
const { cache } = require('../../services/cache');
const svc = require('./analytics.service');

router.use(requireAuth, requireRole('admin'));

router.get('/dashboard', ah(async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  res.json({ data: await svc.dashboard(days) });
}));

router.get('/cache', (_req, res) => res.json({ data: cache.stats() }));

module.exports = router;
