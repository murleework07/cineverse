/**
 * Minimal forward-only migration runner. Applies every *.sql file in
 * ./migrations that isn't recorded in schema_migrations, each in order.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function migrate({ database = env.DB_NAME, quiet = false } = {}) {
  const conn = await mysql.createConnection({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD,
    database, multipleStatements: true,
  });
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const [done] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(done.map((r) => r.name));
    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      if (!quiet) console.log(`applied ${file}`);
    }
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = migrate;
