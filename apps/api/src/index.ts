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
import gammaRoutes from './routes/gammaPresentations';
import assignmentsRoutes from './routes/assignments';
import assignmentGroupsRoutes from './routes/assignmentGroups';
import groupSetsRoutes from './routes/groupSets';
import discussionsRoutes from './routes/discussions';
import quizzesRoutes from './routes/quizzes';
import attendanceRoutes from './routes/attendance';
import gradingRoutes from './routes/grading';
import alertsRoutes from './routes/alerts';
import dashboardsRoutes from './routes/dashboards';
import courseAiRoutes from './routes/courseAi';
import contactRoutes from './routes/contact';
import publicShareRoutes from './routes/publicShare';
import recordCorrectionsRoutes from './routes/recordCorrections';
import { retryFailedR2CleanupJobs } from './jobs/r2CleanupRetry';
import { runRetentionSweep } from './services/retentionSweep';
import { buildOpenApiSpec } from './lib/openapi';
import type { AppBindings, AppEnv } from './types';
export { MaterialGenerationWorkflow } from './workflows/materialGeneration';

export type Env = AppBindings;

const app = new Hono<AppEnv>();

// CORS: refuse to serve anything if CORS_ORIGIN isn't pinned. Wildcard +
// credentials is a CSRF foot-gun that we never want as a silent default, so we
// fail loud instead. `CORS_ORIGIN` is set in wrangler.toml ([vars]) for
// production and .dev.vars for local dev; an unset value indicates a misdeploy
// and must be visible immediately.
//
// The value can be a single origin ("https://fsuac.com") or a comma-separated
// list. The hono cors middleware accepts either a string or a function; we
// pass a function so we can answer per-request without rebuilding the list.
app.use('*', async (c, next) => {
  const raw = c.env.CORS_ORIGIN?.trim();
  if (!raw) {
    console.error('CORS_ORIGIN is not configured; refusing all cross-origin traffic');
    return c.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'CORS is not configured on this Worker.',
          i18nKey: ERROR_I18N[ERROR_CODES.INTERNAL_ERROR],
        },
      },
      500,
    );
  }
  const allowed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return cors({
    origin: (origin) => (origin && allowed.includes(origin) ? origin : null),
    credentials: true,
  })(c, next);
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
app.route('/api', gammaRoutes);
app.route('/api', assignmentsRoutes);
app.route('/api', assignmentGroupsRoutes);
app.route('/api', groupSetsRoutes);
app.route('/api', discussionsRoutes);
app.route('/api', quizzesRoutes);
app.route('/api', attendanceRoutes);
app.route('/api', gradingRoutes);
app.route('/api', alertsRoutes);
app.route('/api', dashboardsRoutes);
app.route('/api', courseAiRoutes);
app.route('/api', contactRoutes);
app.route('/api', publicShareRoutes);
app.route('/api', recordCorrectionsRoutes);

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

// Recognise upstream-edge blocks (e.g. Cloudflare denying our Neon HTTP fetch
// with "error code: 1006" / 1020 / 1015). Surfacing these as a generic 500
// hides the actual cause from operators and gives the client a confusing
// "Internal error" instead of "try again in a moment".
function isUpstreamEdgeBlock(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message ?? '';
  if (!msg.startsWith('Server error (HTTP status ')) return false;
  return /error code:\s*\d{3,4}/i.test(msg);
}

app.onError((err, c) => {
  if (err instanceof ApiException) {
    return failure(c, err);
  }
  if (isUpstreamEdgeBlock(err)) {
    console.error('upstream edge block', err);
    return failure(
      c,
      new ApiException(
        503,
        ERROR_CODES.UPSTREAM_UNAVAILABLE,
        'Database temporarily unavailable',
      ),
    );
  }
  console.error('unhandled error', err);
  return unhandledFailure(c, err);
});

// Cloudflare Workers entrypoint. We export both `fetch` (HTTP requests
// routed through Hono) and `scheduled` (cron triggers, see wrangler.toml
// `[triggers]`). The retention sweep is intentionally the only scheduled
// job today; future cron work should branch on `controller.cron`.
//
// `request` is re-exposed so the existing integration tests (which call
// `app.request(...)` — a Hono test helper) keep working unchanged.
export default {
  fetch: app.fetch,
  request: app.request.bind(app),
  // Expose Hono's introspection so the auth-coverage test can scan registered
  // routes without grabbing a named export.
  get routes() {
    return app.routes;
  },
  async scheduled(
    controller: ScheduledController,
    env: AppBindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const db = createDb(env.DATABASE_URL);
        try {
          const summary = await runRetentionSweep(db);
          console.log('retention.sweep.ok', { cron: controller.cron, ...summary });
        } catch (err) {
          // Don't rethrow — a failed sweep should retry on the next tick
          // rather than fail the Worker invocation entirely. The audit row
          // is only written on success.
          console.error('retention.sweep.failed', { cron: controller.cron, err });
        }

        // R2-cleanup retry runs alongside the retention sweep. Decoupled try/
        // catch so a Neon hiccup mid-retention doesn't skip retries (and
        // vice versa). Skipped silently when the bucket binding isn't
        // present (dev / preview environments without R2 wired up).
        if (env.COURSE_FILES) {
          try {
            const retrySummary = await retryFailedR2CleanupJobs(db, env.COURSE_FILES);
            console.log('r2Cleanup.retry.ok', { cron: controller.cron, ...retrySummary });
          } catch (err) {
            console.error('r2Cleanup.retry.failed', { cron: controller.cron, err });
          }
        }
      })(),
    );
  },
};
