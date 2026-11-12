const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_POOL_SIZE,
  waitForConnections: true,
  namedPlaceholders: true,
  decimalNumbers: true,
  timezone: 'Z',
});

/** Run a query and return rows. */
async function query(sql, params = {}) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Run `fn` inside a transaction. The callback receives a connection whose
 * `query` method has the same shape as the pool helper.
 */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      query: async (sql, params = {}) => (await conn.query(sql, params))[0],
    };
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, transaction };
