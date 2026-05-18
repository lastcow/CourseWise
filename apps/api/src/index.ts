import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_ROUTES, type HealthResponse } from '@coursewise/shared';

export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  CORS_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', (c, next) => {
  const origin = c.env.CORS_ORIGIN || '*';
  return cors({ origin, credentials: true })(c, next);
});

app.get(API_ROUTES.health, (c) => {
  const body: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  return c.json(body);
});

app.notFound((c) => c.json({ error: 'not_found', message: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error', message: 'Internal error' }, 500);
});

export default app;
