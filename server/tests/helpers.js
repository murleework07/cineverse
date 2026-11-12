const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/config/db');

let counter = 0;
async function createUser({ role = 'user' } = {}) {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter}`;
  const creds = { username: `u_${suffix}`, email: `u_${suffix}@test.dev`, password: 'Passw0rdX' };
  const res = await request(app).post('/api/auth/register').send(creds).expect(201);
  if (role !== 'user') {
    await query('UPDATE users SET role = :role WHERE id = :id', { role, id: res.body.user.id });
    const login = await request(app).post('/api/auth/login').send(creds).expect(200);
    return { ...login.body, creds, cookie: login.headers['set-cookie'] };
  }
  return { ...res.body, creds, cookie: res.headers['set-cookie'] };
}

async function createMovie(overrides = {}) {
  const r = await query(
    'INSERT INTO movies (title, overview, release_year) VALUES (:title, :overview, :year)',
    { title: `Movie ${Date.now()} ${Math.random()}`, overview: 'A test movie', year: 2020, ...overrides });
  return r.insertId;
}

module.exports = { app, request, createUser, createMovie };
