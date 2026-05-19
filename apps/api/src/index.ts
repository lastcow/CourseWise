import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_ROUTES, type HealthResponse, type VersionResponse } from '@coursewise/shared';
import { createDb } from './db/client';
import { ApiException, ERROR_CODES, ERROR_I18N } from './lib/errors';
import { failure, unhandledFailure } from './lib/response';
import authRoutes from './routes/auth';
import meRoutes from './routes/me';
import adminRoutes from './routes/admin';
import adminAiRoutes from './routes/admin/ai';
import teacherInvitationsAdminRoutes from './routes/teacherInvitations';
import teacherRoutes from './routes/teacher';
import coursesRoutes from './routes/courses';
import modulesRoutes from './routes/modules';
import invitationsRoutes from './routes/invitations';
import materialsRoutes from './routes/materials';
import filesRoutes from './routes/files';
import presentationsRoutes from './routes/presentations';
import assignmentsRoutes from './routes/assignments';
import discussionsRoutes from './routes/discussions';
import quizzesRoutes from './routes/quizzes';
import attendanceRoutes from './routes/attendance';
import gradingRoutes from './routes/grading';
import alertsRoutes from './routes/alerts';
import dashboardsRoutes from './routes/dashboards';
import courseAiRoutes from './routes/courseAi';
import contactRoutes from './routes/contact';
import { buildOpenApiSpec } from './lib/openapi';
import type { AppBindings, AppEnv } from './types';
export { MaterialGenerationWorkflow } from './workflows/materialGeneration';

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

app.get('/api/openapi.json', (c) => {
  const protocol =
    c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  const host = c.req.header('host');
  const serverUrl = host ? `${protocol}://${host}` : undefined;
  return c.json(buildOpenApiSpec({ serverUrl }));
});

app.route('/api/auth', authRoutes);
app.route('/api/me', meRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/admin/ai', adminAiRoutes);
app.route('/api/admin', teacherInvitationsAdminRoutes);
app.route('/api/teacher', teacherRoutes);
app.route('/api', coursesRoutes);
app.route('/api', modulesRoutes);
app.route('/api', invitationsRoutes);
app.route('/api', materialsRoutes);
app.route('/api', filesRoutes);
app.route('/api', presentationsRoutes);
app.route('/api', assignmentsRoutes);
app.route('/api', discussionsRoutes);
app.route('/api', quizzesRoutes);
app.route('/api', attendanceRoutes);
app.route('/api', gradingRoutes);
app.route('/api', alertsRoutes);
app.route('/api', dashboardsRoutes);
app.route('/api', courseAiRoutes);
app.route('/api', contactRoutes);

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
