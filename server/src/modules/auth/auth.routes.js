const router = require('express').Router();
const { z } = require('zod');
const env = require('../../config/env');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimit');
const ah = require('../../utils/asyncHandler');
const { track } = require('../../services/events');
const svc = require('./auth.service');

const COOKIE = 'cv_refresh';
const cookieOpts = (expires) => ({
  httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth', expires,
});

const registerSchema = z.object({
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'letters, numbers and underscores only'),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128)
    .regex(/[A-Z]/, 'must contain an uppercase letter')
    .regex(/[0-9]/, 'must contain a number'),
});
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

function send(res, status, { user, accessToken, refresh }) {
  res.cookie(COOKIE, refresh.token, cookieOpts(refresh.expiresAt));
  res.status(status).json({ user, accessToken });
}

router.post('/register', authLimiter, validate(registerSchema), ah(async (req, res) => {
  const result = await svc.register(req.body);
  track('user.registered', { userId: result.user.id });
  send(res, 201, result);
}));

router.post('/login', authLimiter, validate(loginSchema), ah(async (req, res) => {
  const result = await svc.login(req.body);
  track('user.login', { userId: result.user.id });
  send(res, 200, result);
}));

router.post('/refresh', ah(async (req, res) => {
  try {
    send(res, 200, await svc.refresh(req.cookies[COOKIE]));
  } catch (err) {
    res.clearCookie(COOKIE, cookieOpts());
    throw err;
  }
}));

router.post('/logout', ah(async (req, res) => {
  await svc.logout(req.cookies[COOKIE]);
  res.clearCookie(COOKIE, cookieOpts());
  res.status(204).end();
}));

router.get('/me', requireAuth, ah(async (req, res) => {
  res.json({ user: await svc.me(req.user.id) });
}));

module.exports = router;
