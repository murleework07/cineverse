/** OpenAPI 3 description served at /api/docs */
const bearer = [{ bearerAuth: [] }];
const idParam = (name = 'id') => ({ name, in: 'path', required: true, schema: { type: 'integer' } });
const ok = (description = 'OK') => ({ 200: { description } });

module.exports = {
  openapi: '3.0.3',
  info: { title: 'CineVerse API', version: '1.0.0', description: 'Movie review platform: reviews, social graph, recommendations and analytics.' },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      ReviewInput: {
        type: 'object', required: ['rating', 'body'],
        properties: { rating: { type: 'integer', minimum: 1, maximum: 10 }, title: { type: 'string' }, body: { type: 'string', minLength: 10 }, containsSpoilers: { type: 'boolean' } },
      },
      Credentials: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } },
    },
  },
  paths: {
    '/api/auth/register': { post: { tags: ['Auth'], summary: 'Create account', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' } } } } } }, responses: { 201: { description: 'Created' } } } },
    '/api/auth/login': { post: { tags: ['Auth'], summary: 'Log in (sets httpOnly refresh cookie)', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } } }, responses: ok() } },
    '/api/auth/refresh': { post: { tags: ['Auth'], summary: 'Rotate refresh token, get new access token', responses: ok() } },
    '/api/auth/logout': { post: { tags: ['Auth'], summary: 'Revoke refresh token family', responses: { 204: { description: 'No content' } } } },
    '/api/auth/me': { get: { tags: ['Auth'], security: bearer, summary: 'Current user', responses: ok() } },
    '/api/movies': {
      get: {
        tags: ['Movies'], summary: 'Search & filter movies (full-text)',
        parameters: ['q', 'genre', 'yearFrom', 'yearTo', 'minRating', 'sort', 'page', 'limit'].map((name) => ({ name, in: 'query', schema: { type: 'string' } })),
        responses: ok(),
      },
      post: { tags: ['Movies'], security: bearer, summary: 'Create movie (admin)', responses: { 201: { description: 'Created' } } },
    },
    '/api/movies/genres': { get: { tags: ['Movies'], summary: 'List genres', responses: ok() } },
    '/api/movies/trending': { get: { tags: ['Movies'], summary: 'Trending this week', responses: ok() } },
    '/api/movies/{id}': {
      get: { tags: ['Movies'], summary: 'Movie detail with rating histogram & sentiment', parameters: [idParam()], responses: ok() },
      patch: { tags: ['Movies'], security: bearer, summary: 'Update movie (admin)', parameters: [idParam()], responses: ok() },
      delete: { tags: ['Movies'], security: bearer, summary: 'Delete movie (admin)', parameters: [idParam()], responses: { 204: { description: 'Deleted' } } },
    },
    '/api/movies/{id}/similar': { get: { tags: ['Recommendations'], summary: 'Similar movies (item-item CF + content)', parameters: [idParam()], responses: ok() } },
    '/api/movies/{movieId}/reviews': {
      get: { tags: ['Reviews'], summary: 'Reviews for a movie (cursor paginated)', parameters: [idParam('movieId'), { name: 'sort', in: 'query', schema: { type: 'string', enum: ['recent', 'top'] } }, { name: 'cursor', in: 'query', schema: { type: 'string' } }], responses: ok() },
      post: { tags: ['Reviews'], security: bearer, summary: 'Write a review', parameters: [idParam('movieId')], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ReviewInput' } } } }, responses: { 201: { description: 'Created' }, 409: { description: 'Already reviewed' } } },
    },
    '/api/reviews/recent': { get: { tags: ['Reviews'], summary: 'Latest reviews site-wide', responses: ok() } },
    '/api/reviews/feed': { get: { tags: ['Reviews'], security: bearer, summary: 'Reviews from people you follow', responses: ok() } },
    '/api/reviews/{id}': {
      get: { tags: ['Reviews'], parameters: [idParam()], responses: ok() },
      patch: { tags: ['Reviews'], security: bearer, summary: 'Edit own review', parameters: [idParam()], responses: ok() },
      delete: { tags: ['Reviews'], security: bearer, summary: 'Delete own review (or admin)', parameters: [idParam()], responses: { 204: { description: 'Deleted' } } },
    },
    '/api/reviews/{id}/like': {
      put: { tags: ['Reviews'], security: bearer, summary: 'Like (idempotent)', parameters: [idParam()], responses: ok() },
      delete: { tags: ['Reviews'], security: bearer, summary: 'Unlike', parameters: [idParam()], responses: ok() },
    },
    '/api/reviews/{id}/comments': {
      get: { tags: ['Reviews'], parameters: [idParam()], responses: ok() },
      post: { tags: ['Reviews'], security: bearer, parameters: [idParam()], responses: { 201: { description: 'Created' } } },
    },
    '/api/recommendations': { get: { tags: ['Recommendations'], security: bearer, summary: 'Personalised hybrid recommendations', responses: ok() } },
    '/api/users/me': { patch: { tags: ['Users'], security: bearer, summary: 'Update bio / avatar', responses: ok() } },
    '/api/users/me/taste-matches': { get: { tags: ['Users'], security: bearer, summary: 'Users with the most similar taste (Pearson)', responses: ok() } },
    '/api/users/{username}': { get: { tags: ['Users'], summary: 'Public profile & stats', parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/api/users/{username}/follow': {
      put: { tags: ['Users'], security: bearer, parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Followed' } } },
      delete: { tags: ['Users'], security: bearer, parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Unfollowed' } } },
    },
    '/api/watchlist': { get: { tags: ['Watchlist'], security: bearer, responses: ok() } },
    '/api/watchlist/{movieId}': {
      put: { tags: ['Watchlist'], security: bearer, parameters: [idParam('movieId')], responses: ok() },
      delete: { tags: ['Watchlist'], security: bearer, parameters: [idParam('movieId')], responses: { 204: { description: 'Removed' } } },
    },
    '/api/analytics/dashboard': { get: { tags: ['Analytics'], security: bearer, summary: 'Admin dashboard: KPIs, activity, ratings, sentiment, funnel', parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', enum: [7, 30, 90] } }], responses: ok() } },
  },
};
