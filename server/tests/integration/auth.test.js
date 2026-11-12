const { app, request, createUser } = require('../helpers');
const { pool } = require('../../src/config/db');

afterAll(() => pool.end());

const refreshCookie = (res) => res.headers['set-cookie'].find((c) => c.startsWith('cv_refresh=')).split(';')[0];

describe('auth', () => {
  test('register validates input', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'x', email: 'bad', password: 'short' }).expect(400);
    expect(res.body.error.details).toHaveProperty('username');
    expect(res.body.error.details).toHaveProperty('email');
    expect(res.body.error.details).toHaveProperty('password');
  });

  test('register → me, with httpOnly refresh cookie and no password hash leaked', async () => {
    const { accessToken, user, cookie } = await createUser();
    expect(cookie.join(';')).toMatch(/HttpOnly/);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(me.body.user.id).toBe(user.id);
    expect(me.body.user).not.toHaveProperty('password_hash');
  });

  test('duplicate email is a 409', async () => {
    const { creds } = await createUser();
    await request(app).post('/api/auth/register').send({ ...creds, username: `${creds.username}x` }).expect(409);
  });

  test('wrong password is rejected', async () => {
    const { creds } = await createUser();
    await request(app).post('/api/auth/login').send({ email: creds.email, password: 'Wrong1234' }).expect(401);
  });

  test('protected route without token is 401', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage').expect(401);
  });

  test('refresh rotates tokens and detects reuse of a rotated token', async () => {
    const { creds } = await createUser();
    const login = await request(app).post('/api/auth/login').send(creds).expect(200);
    const original = refreshCookie(login);

    const first = await request(app).post('/api/auth/refresh').set('Cookie', original).expect(200);
    const rotated = refreshCookie(first);
    expect(rotated).not.toBe(original);
    expect(first.body.accessToken).toBeTruthy();

    // replaying the old token = theft signal → whole family revoked
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', original).expect(401);
    expect(replay.body.error.message).toMatch(/reuse/);
    await request(app).post('/api/auth/refresh').set('Cookie', rotated).expect(401);
  });

  test('logout revokes the refresh token', async () => {
    const { creds } = await createUser();
    const login = await request(app).post('/api/auth/login').send(creds).expect(200);
    const cookie = refreshCookie(login);
    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });
});
