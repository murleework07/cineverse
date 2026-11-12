const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const ah = require('../../utils/asyncHandler');
const svc = require('./recommendations.service');

router.get('/recommendations', requireAuth, ah(async (req, res) => {
  res.json(await svc.forUser(req.user.id, Math.min(Number(req.query.limit) || 12, 30)));
}));

router.get('/movies/:id/similar', ah(async (req, res) => {
  res.json({ data: await svc.similar(Number(req.params.id), Math.min(Number(req.query.limit) || 8, 20)) });
}));

module.exports = router;
