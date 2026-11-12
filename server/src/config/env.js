require('dotenv').config();
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('cineverse'),
  DB_PASSWORD: z.string().default('cineverse'),
  DB_NAME: z.string().default('cineverse'),
  DB_POOL_SIZE: z.coerce.number().default(10),
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-access-secret-dev-access-secret-123'),
  JWT_REFRESH_SECRET: z.string().min(32).default('dev-refresh-secret-dev-refresh-secret-12'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(7),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
if (env.NODE_ENV === 'production' && env.JWT_ACCESS_SECRET.startsWith('dev-')) {
  console.error('Refusing to start in production with development JWT secrets');
  process.exit(1);
}

module.exports = env;
