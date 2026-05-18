import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_ROUTES, type HealthResponse, type VersionResponse } from '@coursewise/shared';
import { createDb } from './db/client';
import { ApiException, ERROR_CODES, ERROR_I18N } from './lib/errors';
import { failure, unhandledFailure } from './lib/response';
import authRoutes from './routes/auth';
import meRoutes from './routes/me';
import adminRoutes from './routes/admin';
import teacherRoutes from './routes/teacher';
import coursesRoutes from './routes/courses';
import modulesRoutes from './routes/modules';
import invitationsRoutes, { invitationsPublic } from './routes/invitations';
import materialsRoutes from './routes/materials';
import filesRoutes from './routes/files';
import type { AppBindings, AppEnv } from './types';

export type Env = AppBindings;

const app = new Hono<AppEnv>();

app.use('*', (c, next) => {
  const origin = c.env.CORS_ORIGIN || '*';
  return cors({ origin, credentials: true })(c, next);
});

app.use('*', async (c, next) => {
  if (!c.var.db) {
    c.set('db', createDb(c.env.DATABASE_URL));
  }
  await next();
});

const health: HealthResponse = {
  status: 'ok',
  timestamp: '',
};

app.get(API_ROUTES.health, (c) => c.json({ ...health, timestamp: new Date().toISOString() }));

app.get(API_ROUTES.version, (c) => {
  const body: VersionResponse = {
    version: '1.0.0',
    commit: c.env.GIT_SHA ?? 'dev',
    builtAt: c.env.BUILT_AT ?? null,
  };
  return c.json(body);
});

// Back-compat for /health while the rest of M0 still references it.
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.route('/api/auth', authRoutes);
app.route('/api/me', meRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/teacher', teacherRoutes);
app.route('/api', invitationsPublic);
app.route('/api', coursesRoutes);
app.route('/api', modulesRoutes);
app.route('/api', invitationsRoutes);
app.route('/api', materialsRoutes);
app.route('/api', filesRoutes);

app.notFound((c) =>
  c.json(
    {
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Not found',
        i18nKey: ERROR_I18N.NOT_FOUND,
      },
    },
    404,
  ),
);

app.onError((err, c) => {
  if (err instanceof ApiException) {
    return failure(c, err);
  }
  console.error('unhandled error', err);
  return unhandledFailure(c, err);
});

export default app;
