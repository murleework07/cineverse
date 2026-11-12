const { app, request, createUser, createMovie } = require('../helpers');
const { pool, query } = require('../../src/config/db');

afterAll(() => pool.end());

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const movieStats = async (id) => (await query('SELECT avg_rating, review_count FROM movies WHERE id = :id', { id }))[0];

describe('reviews', () => {
  let alice; let bob; let movieId;
  beforeAll(async () => {
    [alice, bob] = await Promise.all([createUser(), createUser()]);
    movieId = await createMovie({ title: 'Integration Test Odyssey' });
  });

  test('create review updates movie aggregates and scores sentiment', async () => {
    const res = await request(app).post(`/api/movies/${movieId}/reviews`).set(auth(alice.accessToken))
      .send({ rating: 9, body: 'Absolutely brilliant, a stunning and moving film.' }).expect(201);
    expect(res.body.data.sentiment.label).toBe('positive');
    await request(app).post(`/api/movies/${movieId}/reviews`).set(auth(bob.accessToken))
      .send({ rating: 4, body: 'Boring and predictable, I was disappointed.' }).expect(201);
    expect(await movieStats(movieId)).toEqual({ avg_rating: 6.5, review_count: 2 });
  });

  test('one review per user per movie', async () => {
    await request(app).post(`/api/movies/${movieId}/reviews`).set(auth(alice.accessToken))
      .send({ rating: 5, body: 'Trying to review this a second time.' }).expect(409);
  });

  test('rating must be 1–10 and body ≥ 10 chars', async () => {
    const res = await request(app).post(`/api/movies/${movieId}/reviews`).set(auth(alice.accessToken))
      .send({ rating: 11, body: 'short' }).expect(400);
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['rating', 'body']));
  });

  test('only the author can edit; edit re-weights the average', async () => {
    const { body } = await request(app).get(`/api/movies/${movieId}/reviews`).expect(200);
    const alicesReview = body.data.find((r) => r.author.id === alice.user.id);
    await request(app).patch(`/api/reviews/${alicesReview.id}`).set(auth(bob.accessToken)).send({ rating: 1 }).expect(403);
    await request(app).patch(`/api/reviews/${alicesReview.id}`).set(auth(alice.accessToken)).send({ rating: 10 }).expect(200);
    expect((await movieStats(movieId)).avg_rating).toBe(7);
  });

  test('likes are idempotent', async () => {
    const { body } = await request(app).get(`/api/movies/${movieId}/reviews`).expect(200);
    const id = body.data[0].id;
    await request(app).put(`/api/reviews/${id}/like`).set(auth(bob.accessToken)).expect(200);
    const again = await request(app).put(`/api/reviews/${id}/like`).set(auth(bob.accessToken)).expect(200);
    expect(again.body.likeCount).toBe(1);
    const un = await request(app).delete(`/api/reviews/${id}/like`).set(auth(bob.accessToken)).expect(200);
    expect(un.body.likeCount).toBe(0);
  });

  test('comments increment comment_count', async () => {
    const { body } = await request(app).get(`/api/movies/${movieId}/reviews`).expect(200);
    const id = body.data[0].id;
    await request(app).post(`/api/reviews/${id}/comments`).set(auth(alice.accessToken)).send({ body: 'Nice take!' }).expect(201);
    const review = await request(app).get(`/api/reviews/${id}`).expect(200);
    expect(review.body.data.commentCount).toBe(1);
  });

  test('cursor pagination walks every review exactly once', async () => {
    const m = await createMovie();
    const users = await Promise.all(Array.from({ length: 5 }, () => createUser()));
    for (const [i, u] of users.entries()) {
      await request(app).post(`/api/movies/${m}/reviews`).set(auth(u.accessToken)).send({ rating: i + 1, body: `Review number ${i} for paging.` }).expect(201);
    }
    const seen = [];
    let cursor;
    do {
      const res = await request(app).get(`/api/movies/${m}/reviews`).query({ limit: 2, ...(cursor && { cursor }) }).expect(200);
      seen.push(...res.body.data.map((r) => r.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  test('delete rolls back aggregates', async () => {
    const m = await createMovie();
    const res = await request(app).post(`/api/movies/${m}/reviews`).set(auth(alice.accessToken)).send({ rating: 8, body: 'Great film, would watch again.' }).expect(201);
    await request(app).delete(`/api/reviews/${res.body.data.id}`).set(auth(bob.accessToken)).expect(403);
    await request(app).delete(`/api/reviews/${res.body.data.id}`).set(auth(alice.accessToken)).expect(204);
    expect(await movieStats(m)).toEqual({ avg_rating: 0, review_count: 0 });
  });
});

describe('social feed & watchlist', () => {
  test('feed shows reviews from followed users only', async () => {
    const [me, friend, stranger] = await Promise.all([createUser(), createUser(), createUser()]);
    const m = await createMovie();
    await request(app).post(`/api/movies/${m}/reviews`).set(auth(friend.accessToken)).send({ rating: 8, body: 'My friend wrote this review.' }).expect(201);
    await request(app).post(`/api/movies/${m}/reviews`).set(auth(stranger.accessToken)).send({ rating: 3, body: 'A stranger wrote this one.' }).expect(201);
    await request(app).put(`/api/users/${friend.user.username}/follow`).set(auth(me.accessToken)).expect(204);
    await request(app).put(`/api/users/${me.user.username}/follow`).set(auth(me.accessToken)).expect(400);
    const feed = await request(app).get('/api/reviews/feed').set(auth(me.accessToken)).expect(200);
    expect(feed.body.data.map((r) => r.author.username)).toEqual([friend.user.username]);
  });

  test('watchlist add / mark watched / remove', async () => {
    const u = await createUser();
    const m = await createMovie();
    await request(app).put(`/api/watchlist/${m}`).set(auth(u.accessToken)).send({}).expect(200);
    await request(app).put(`/api/watchlist/${m}`).set(auth(u.accessToken)).send({ watched: true }).expect(200);
    let list = await request(app).get('/api/watchlist').set(auth(u.accessToken)).expect(200);
    expect(list.body.data).toEqual([expect.objectContaining({ id: m, watched: true })]);
    await request(app).delete(`/api/watchlist/${m}`).set(auth(u.accessToken)).expect(204);
    list = await request(app).get('/api/watchlist').set(auth(u.accessToken)).expect(200);
    expect(list.body.data).toHaveLength(0);
  });
});

describe('admin & analytics', () => {
  test('non-admins cannot create movies or view analytics', async () => {
    const u = await createUser();
    await request(app).post('/api/movies').set(auth(u.accessToken)).send({ title: 'Nope' }).expect(403);
    await request(app).get('/api/analytics/dashboard').set(auth(u.accessToken)).expect(403);
  });

  test('admin creates a movie and sees the dashboard', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await request(app).post('/api/movies').set(auth(admin.accessToken))
      .send({ title: 'Admin Created Film', releaseYear: 2024, genres: ['Drama', 'Mystery'] }).expect(201);
    expect(res.body.data.genres).toEqual(['Drama', 'Mystery']);
    const dash = await request(app).get('/api/analytics/dashboard?days=7').set(auth(admin.accessToken)).expect(200);
    expect(dash.body.data.activity).toHaveLength(7);
    expect(dash.body.data.overview.reviews).toBeGreaterThan(0);
    expect(dash.body.data.ratingDistribution).toHaveLength(10);
  });

  test('full-text search finds movies by title words', async () => {
    await createMovie({ title: 'Zyxwv Galactic Saga', overview: 'space opera' });
    const res = await request(app).get('/api/movies').query({ q: 'zyxwv', sort: 'relevance' }).expect(200);
    expect(res.body.data[0].title).toBe('Zyxwv Galactic Saga');
  });

  test('recommendations work for a cold-start user', async () => {
    const u = await createUser();
    const res = await request(app).get('/api/recommendations').set(auth(u.accessToken)).expect(200);
    expect(res.body.meta.strategy).toBe('popularity');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
