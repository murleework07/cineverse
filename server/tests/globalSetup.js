/** Recreate the test schema from migrations before the suite runs. */
module.exports = async () => {
  require('./env');
  const mysql = require('mysql2/promise');
  const env = require('../src/config/env');
  const conn = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME });
  const [tables] = await conn.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?', [env.DB_NAME]);
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { t } of tables) await conn.query(`DROP TABLE \`${t}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  await require('../src/db/migrate')({ quiet: true });
};
