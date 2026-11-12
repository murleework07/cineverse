const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { query, transaction } = require('../../config/db');
const AppError = require('../../utils/AppError');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, role: u.role, bio: u.bio, avatarUrl: u.avatar_url, createdAt: u.created_at };
}

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, username: user.username }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}

async function issueRefreshToken(db, userId, familyId = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (:userId, :hash, :familyId, :expiresAt)',
    { userId, hash: sha256(token), familyId, expiresAt },
  );
  return { token, expiresAt };
}

async function register({ username, email, password }) {
  const passwordHash = await bcrypt.hash(password, 12);
  return transaction(async (tx) => {
    const result = await tx.query(
      'INSERT INTO users (username, email, password_hash) VALUES (:username, :email, :passwordHash)',
      { username, email: email.toLowerCase(), passwordHash },
    );
    const [user] = await tx.query('SELECT * FROM users WHERE id = :id', { id: result.insertId });
    const refresh = await issueRefreshToken(tx, user.id);
    return { user: publicUser(user), accessToken: signAccessToken(user), refresh };
  });
}

async function login({ email, password }) {
  const [user] = await query('SELECT * FROM users WHERE email = :email', { email: email.toLowerCase() });
  // compare against a dummy hash when the user doesn't exist to avoid a timing oracle
  const ok = await bcrypt.compare(password, user ? user.password_hash : '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5bHQ4Vq0Y5ZQ2j8k6fXx1qE2y3pQe6W');
  if (!user || !ok) throw AppError.unauthorized('Invalid email or password');
  const refresh = await issueRefreshToken({ query }, user.id);
  return { user: publicUser(user), accessToken: signAccessToken(user), refresh };
}

/**
 * Rotate a refresh token. Presenting an already-revoked token signals theft,
 * so the whole token family is revoked (refresh-token reuse detection).
 */
async function refresh(token) {
  if (!token) throw AppError.unauthorized('Missing refresh token');
  let compromisedFamily = null;
  try {
    return await transaction(async (tx) => {
      const [row] = await tx.query('SELECT * FROM refresh_tokens WHERE token_hash = :hash FOR UPDATE', { hash: sha256(token) });
      if (!row) throw AppError.unauthorized('Invalid refresh token');
      if (row.revoked_at) {
        compromisedFamily = row.family_id;
        throw AppError.unauthorized('Refresh token reuse detected');
      }
      if (new Date(row.expires_at) < new Date()) throw AppError.unauthorized('Refresh token expired');

      await tx.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = :id', { id: row.id });
      const [user] = await tx.query('SELECT * FROM users WHERE id = :id', { id: row.user_id });
      const next = await issueRefreshToken(tx, user.id, row.family_id);
      return { user: publicUser(user), accessToken: signAccessToken(user), refresh: next };
    });
  } finally {
    // Must run after the transaction rolls back, otherwise the revocation would be undone too.
    if (compromisedFamily) {
      await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = :f AND revoked_at IS NULL', { f: compromisedFamily });
    }
  }
}

async function logout(token) {
  if (!token) return;
  const [row] = await query('SELECT family_id FROM refresh_tokens WHERE token_hash = :hash', { hash: sha256(token) });
  if (row) await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = :f AND revoked_at IS NULL', { f: row.family_id });
}

async function me(userId) {
  const [user] = await query('SELECT * FROM users WHERE id = :id', { id: userId });
  if (!user) throw AppError.notFound('User not found');
  return publicUser(user);
}

module.exports = { register, login, refresh, logout, me, publicUser };
