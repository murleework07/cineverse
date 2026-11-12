const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');
const env = require('./config/env');
const logger = require('./config/logger');
const { pool } = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/error');
const openapi = require('./docs/openapi');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use('/api', apiLimiter);
app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api', require('./modules/recommendations/recommendations.routes'));
app.use('/api/movies', require('./modules/movies/movies.routes'));
app.use('/api', require('./modules/reviews/reviews.routes'));
app.use('/api/users', require('./modules/users/users.routes'));
app.use('/api/watchlist', require('./modules/watchlist/watchlist.routes'));
app.use('/api/analytics', require('./modules/analytics/analytics.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
