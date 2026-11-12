/**
 * Seeds a realistic dataset: movies, two known accounts and ~80 synthetic users
 * with distinct genre "taste profiles", so the recommender, analytics dashboards
 * and social feed have meaningful signal out of the box. Deterministic (seeded PRNG).
 *
 *   admin@cineverse.dev / Admin@1234   (role: admin)
 *   demo@cineverse.dev  / Demo@1234
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const migrate = require('./migrate');
const MOVIES = require('./seed-data');
const { analyze } = require('../services/sentiment');

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rand(); return s - 3; };

const PERSONAS = [
  { name: 'scifi', likes: ['Sci-Fi', 'Mystery'], dislikes: ['Romance'] },
  { name: 'horror', likes: ['Horror', 'Thriller'], dislikes: ['Animation', 'Romance'] },
  { name: 'romcom', likes: ['Romance', 'Comedy', 'Music'], dislikes: ['Horror'] },
  { name: 'action', likes: ['Action', 'Adventure'], dislikes: ['Romance', 'Music'] },
  { name: 'artsy', likes: ['Drama', 'History', 'Music'], dislikes: ['Comedy'] },
  { name: 'family', likes: ['Animation', 'Fantasy', 'Comedy'], dislikes: ['Horror', 'Crime'] },
  { name: 'crime', likes: ['Crime', 'Thriller', 'Mystery'], dislikes: ['Animation'] },
];

const TEXT = {
  high: [
    'An absolute masterpiece. The direction is stunning and the performances are incredible. I loved every minute.',
    'Brilliant, gripping and beautifully shot. One of the best films I have seen in years, highly recommend.',
    'Really moving story with a powerful ending. The score is gorgeous and the cast is excellent.',
    'Fantastic from start to finish. Clever writing, memorable characters and a truly epic scale.',
    'I did not expect to enjoy it this much. Wonderful, heartfelt and so much fun to watch.',
  ],
  mid: [
    'Solid film with some great moments, but the second half drags and the pacing feels slow.',
    'Decent entertainment. The visuals are impressive, though the plot is a bit predictable.',
    'Good performances, but the script is messy in places. Worth a watch on a lazy evening.',
    'Enjoyable enough, nothing special. Some scenes are charming while others feel flat.',
  ],
  low: [
    'Honestly boring and far too long. The story is predictable and the characters are flat.',
    'A disappointing mess. Great premise, but the execution is lazy and the dialogue is painful.',
    'Overrated. I found it tedious and forgettable, not worth the hype at all.',
    'Really not good. Confusing plot, weak acting and a pointless ending. What a waste of time.',
  ],
};
// A few deliberately sarcastic reviews so the "rating vs sentiment mismatch" panel has data.
const SARCASTIC = 'Wow, what a waste of three hours, said nobody ever. Terrible for my sleep schedule because I could not stop thinking about it.';

const COMMENTS = ['Totally agree!', 'Great take, made me want to rewatch it.', 'Hard disagree, but well written.', 'The soundtrack alone deserves a 10.', 'Underrated opinion.', 'This review convinced me to watch it tonight.'];

const daysAgo = (d) => new Date(Date.now() - d * 86_400_000 - Math.floor(rand() * 86_400_000));

async function run() {
  await migrate();
  const conn = await pool.getConnection();
  const q = async (sql, params) => (await conn.query(sql, params))[0];
  try {
    console.log('clearing tables…');
    await q('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['events', 'follows', 'watchlist', 'comments', 'review_likes', 'reviews', 'movie_genres', 'genres', 'movies', 'refresh_tokens', 'users']) {
      await q(`TRUNCATE TABLE ${t}`);
    }
    await q('SET FOREIGN_KEY_CHECKS = 1');

    // genres + movies
    const genreNames = [...new Set(MOVIES.flatMap((m) => m[4]))].sort();
    await q('INSERT INTO genres (name) VALUES ?', [genreNames.map((g) => [g])]);
    const genreRows = await q('SELECT id, name FROM genres');
    const genreId = Object.fromEntries(genreRows.map((g) => [g.name, g.id]));
    await q('INSERT INTO movies (title, release_year, director, runtime_min, overview) VALUES ?',
      [MOVIES.map(([title, year, director, runtime, , overview]) => [title, year, director, runtime, overview])]);
    const movieRows = await q('SELECT id, title FROM movies ORDER BY id');
    const movies = movieRows.map((m, i) => ({ id: m.id, genres: MOVIES[i][4], quality: 6.5 + rand() * 2.5 }));
    await q('INSERT INTO movie_genres (movie_id, genre_id) VALUES ?', [movies.flatMap((m) => m.genres.map((g) => [m.id, genreId[g]]))]);

    // users
    console.log('creating users…');
    const userHash = await bcrypt.hash('Password1', 10);
    const users = [
      ['admin', 'admin@cineverse.dev', await bcrypt.hash('Admin@1234', 12), 'admin', 'Platform admin', 0],
      ['demo', 'demo@cineverse.dev', await bcrypt.hash('Demo@1234', 12), 'user', 'Sci-fi nerd. Will defend Interstellar to the end.', 0],
    ];
    const first = ['aarav', 'priya', 'rohan', 'ananya', 'kabir', 'isha', 'vikram', 'meera', 'alex', 'sam', 'jordan', 'maya', 'leo', 'zara', 'noah', 'emma', 'arjun', 'diya', 'kai', 'nina'];
    for (let i = 0; i < 80; i++) {
      const persona = PERSONAS[i % PERSONAS.length];
      users.push([`${pick(first)}_${persona.name}${i}`, `user${i}@example.com`, userHash, 'user', `Mostly into ${persona.likes.join(', ').toLowerCase()}.`, 1 + Math.floor(rand() * 89)]);
    }
    await q('INSERT INTO users (username, email, password_hash, role, bio, created_at) VALUES ?',
      [users.map(([u, e, h, r, b, d]) => [u, e, h, r, b, daysAgo(d + 30)])]);
    const userRows = await q('SELECT id, username FROM users ORDER BY id');
    const demoId = userRows[1].id;

    // reviews: rating = movie quality + persona affinity + noise
    console.log('writing reviews…');
    const reviews = [];
    const personaOf = new Map();
    userRows.forEach((u, idx) => {
      if (idx === 0) return; // admin doesn't review
      const persona = idx === 1 ? PERSONAS[0] : PERSONAS[(idx - 2) % PERSONAS.length];
      personaOf.set(u.id, persona);
      const n = idx === 1 ? 6 : 6 + Math.floor(rand() * 12);
      const preferred = movies.filter((m) => m.genres.some((g) => persona.likes.includes(g)));
      const chosen = new Set();
      while (chosen.size < Math.min(n, movies.length)) chosen.add(rand() < 0.75 ? pick(preferred) : pick(movies));
      for (const m of chosen) {
        const aff = m.genres.reduce((s, g) => s + (persona.likes.includes(g) ? 1.2 : 0) - (persona.dislikes.includes(g) ? 1.8 : 0), 0);
        const rating = Math.max(1, Math.min(10, Math.round(m.quality + aff - 0.8 + gauss() * 1.1)));
        const sarcastic = rating >= 8 && rand() < 0.02;
        const body = sarcastic ? SARCASTIC : pick(rating >= 8 ? TEXT.high : rating >= 5 ? TEXT.mid : TEXT.low);
        const { score, label } = analyze(body);
        reviews.push([u.id, m.id, rating, null, body, rand() < 0.08, score, label, daysAgo(Math.floor(Math.pow(rand(), 1.6) * 90))]);
      }
    });
    await q(`INSERT INTO reviews (user_id, movie_id, rating, title, body, contains_spoilers, sentiment_score, sentiment_label, created_at) VALUES ?`, [reviews]);
    await q(`UPDATE movies m JOIN (SELECT movie_id, SUM(rating) s, COUNT(*) c FROM reviews GROUP BY movie_id) r ON r.movie_id = m.id
             SET m.rating_sum = r.s, m.review_count = r.c`);

    // likes & comments
    const reviewRows = await q('SELECT id, user_id, rating, created_at FROM reviews');
    const likes = new Set();
    const comments = [];
    for (const r of reviewRows) {
      const nLikes = Math.floor(Math.pow(rand(), 2.5) * 25);
      for (let k = 0; k < nLikes; k++) {
        const u = pick(userRows).id;
        if (u !== r.user_id) likes.add(`${u}:${r.id}`);
      }
      if (rand() < 0.25) {
        for (let k = 0; k < 1 + Math.floor(rand() * 3); k++) comments.push([r.id, pick(userRows.slice(1)).id, pick(COMMENTS), new Date(new Date(r.created_at).getTime() + rand() * 86_400_000 * 2)]);
      }
    }
    const likeRows = [...likes].map((s) => s.split(':').map(Number));
    await q('INSERT INTO review_likes (user_id, review_id, created_at) VALUES ?', [likeRows.map(([u, r]) => [u, r, daysAgo(Math.floor(rand() * 30))])]);
    if (comments.length) await q('INSERT INTO comments (review_id, user_id, body, created_at) VALUES ?', [comments]);
    await q(`UPDATE reviews r LEFT JOIN (SELECT review_id, COUNT(*) c FROM review_likes GROUP BY review_id) l ON l.review_id = r.id
             LEFT JOIN (SELECT review_id, COUNT(*) c FROM comments GROUP BY review_id) cm ON cm.review_id = r.id
             SET r.like_count = COALESCE(l.c, 0), r.comment_count = COALESCE(cm.c, 0)`);

    // follows: mostly within the same persona
    const follows = new Set();
    for (const u of userRows.slice(1)) {
      const p = personaOf.get(u.id);
      const same = userRows.filter((o) => personaOf.get(o.id) === p && o.id !== u.id);
      for (let k = 0; k < 3 + Math.floor(rand() * 5); k++) {
        const target = rand() < 0.7 && same.length ? pick(same) : pick(userRows.slice(1));
        if (target.id !== u.id) follows.add(`${u.id}:${target.id}`);
      }
    }
    await q('INSERT INTO follows (follower_id, followee_id) VALUES ?', [[...follows].map((s) => s.split(':').map(Number))]);

    // watchlist
    const wl = new Set();
    for (const u of userRows.slice(1)) for (let k = 0; k < Math.floor(rand() * 6); k++) wl.add(`${u.id}:${pick(movies).id}`);
    await q('INSERT IGNORE INTO watchlist (user_id, movie_id, watched, added_at) VALUES ?',
      [[...wl].map((s) => { const [u, m] = s.split(':').map(Number); return [u, m, rand() < 0.3, daysAgo(Math.floor(rand() * 20))]; })]);

    // analytics events (views/searches/logins) over the last 90 days, with a growth trend
    console.log('generating analytics events…');
    const SEARCHES = ['nolan', 'horror', 'interstellar', 'romance', 'dune', 'animation', 'parasite', 'batman', 'comedy', 'villeneuve'];
    const events = [];
    for (let d = 89; d >= 0; d--) {
      const daily = Math.round(20 + (89 - d) * 0.6 + gauss() * 4);
      for (let k = 0; k < daily; k++) {
        const u = pick(userRows.slice(1)).id;
        const when = daysAgo(d);
        const roll = rand();
        if (roll < 0.6) events.push([u, 'movie.view', 'movie', pick(movies).id, null, when]);
        else if (roll < 0.75) events.push([u, 'search', null, null, JSON.stringify({ q: pick(SEARCHES) }), when]);
        else if (roll < 0.85) events.push([u, 'watchlist.added', 'movie', pick(movies).id, null, when]);
        else events.push([u, 'user.login', null, null, null, when]);
      }
    }
    for (const r of reviews) events.push([r[0], 'review.created', 'movie', r[1], null, r[8]]);
    for (let i = 0; i < events.length; i += 2000) {
      await q('INSERT INTO events (user_id, type, entity_type, entity_id, metadata, created_at) VALUES ?', [events.slice(i, i + 2000)]);
    }

    console.log(`seeded ${movies.length} movies, ${userRows.length} users, ${reviews.length} reviews, ${likeRows.length} likes, ${comments.length} comments, ${follows.size} follows, ${events.length} events`);
    console.log(`demo user id ${demoId}: demo@cineverse.dev / Demo@1234   admin: admin@cineverse.dev / Admin@1234`);
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
