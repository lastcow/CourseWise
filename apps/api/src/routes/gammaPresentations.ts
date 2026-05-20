import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import {
  generateGammaPresentationSchema,
  type CreateGammaPresentationResponse,
  type GammaGenerationJob,
  type GammaTheme,
  type GenerateGammaPresentationInput,
} from '@coursewise/shared';
import { gammaGenerationJobs, presentations, readingMaterials } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canWriteCourse } from '../services/courseAccess';
import {
  GammaClient,
  buildInputText,
  pollAndFinalize,
  type MaterialForGamma,
} from '../services/gamma';
import type { AppBindings, AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

const THEMES_CACHE_KEY = 'gamma:themes:v2';
const THEMES_CACHE_TTL_SECONDS = 60 * 60;

function clientOr500(env: AppBindings): GammaClient {
  if (!env.GAMMA_API_KEY) {
    throw new ApiException(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'GAMMA_API_KEY is not configured on this Worker',
    );
  }
  return new GammaClient(env.GAMMA_API_KEY);
}

function toJobEnvelope(row: typeof gammaGenerationJobs.$inferSelect): GammaGenerationJob {
  return {
    id: row.id,
    courseId: row.courseId,
    presentationId: row.presentationId ?? null,
    status: row.status,
    gammaUrl: row.gammaUrl ?? null,
    exportUrl: row.exportUrl ?? null,
    errorMessage: row.errorMessage ?? null,
    creditsDeducted: row.creditsDeducted ?? null,
    creditsRemaining: row.creditsRemaining ?? null,
    materialIds: row.materialIds,
    requestParams: (row.requestParams ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? null,
  };
}

// -------- GET /api/gamma/themes --------

r.get('/gamma/themes', requireScopeGroup('presentationsRead'), async (c) => {
  const client = clientOr500(c.env);
  const kv = c.env.RATE_LIMIT_KV;

  if (kv) {
    const cached = await kv.get(THEMES_CACHE_KEY, { type: 'json' });
    if (cached && Array.isArray(cached)) {
      return success(c, cached as GammaTheme[]);
    }
  }

  const themes = await client.listThemes();

  if (kv) {
    try {
      await kv.put(THEMES_CACHE_KEY, JSON.stringify(themes), {
        expirationTtl: THEMES_CACHE_TTL_SECONDS,
      });
    } catch (err) {
      console.error('gamma: failed to cache themes', { err });
    }
  }

  return success(c, themes);
});

// -------- POST /api/courses/:courseId/presentations/gamma --------

r.post(
  '/courses/:courseId/presentations/gamma',
  requireScopeGroup('presentationsWrite'),
  validateJson(generateGammaPresentationSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as GenerateGammaPresentationInput;

    // Fetch all referenced materials and assert they belong to this course.
    const materialRows = await db
      .select({
        id: readingMaterials.id,
        courseId: readingMaterials.courseId,
        title: readingMaterials.title,
        description: readingMaterials.description,
        sourceType: readingMaterials.sourceType,
        content: readingMaterials.content,
      })
      .from(readingMaterials)
      .where(inArray(readingMaterials.id, input.materialIds));

    if (materialRows.length !== input.materialIds.length) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'One or more reading materials not found');
    }
    for (const m of materialRows) {
      if (m.courseId !== courseId) {
        throw new ApiException(
          403,
          ERROR_CODES.FORBIDDEN,
          'Reading material does not belong to this course',
        );
      }
    }

    const materials: MaterialForGamma[] = materialRows.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      sourceType: m.sourceType,
      content: m.content,
    }));

    const inputText = buildInputText(materials);
    if (inputText.length === 0) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Selected reading materials produced no input text',
      );
    }

    const client = clientOr500(c.env);
    const created = await client.createGeneration({
      inputText,
      format: input.format,
      exportAs: input.exportAs,
      textMode: input.textMode,
      title: input.title,
      themeId: input.themeId ?? null,
      additionalInstructions: input.additionalInstructions ?? null,
      // Only forward numCards when the teacher set one — letting Gamma decide
      // when omitted gives better defaults than pinning a fixed count.
      ...(input.numCards ? { numCards: input.numCards } : {}),
      textOptions: { amount: input.amount },
      imageOptions: {
        source: input.imageSource,
        style: input.imageStyle ?? null,
      },
    });

    // The neon-http driver doesn't support `db.transaction`, so insert the
    // presentation first and then the job. If the job insert fails, best-effort
    // delete the presentation we just created so we don't leave a draft row
    // with no Gamma job pointing at it. The Gamma side has already debited
    // credits at this point — that remains a known orphan window that would
    // need a sweeper if it starts happening.
    // `requestParams` snapshots the *effective* request (zod defaults already
    // applied — `amount`, `imageSource`, `exportAs`, `textMode`).
    const [presRow] = await db
      .insert(presentations)
      .values({
        courseId,
        moduleId: input.moduleId ?? null,
        title: input.title,
        status: 'draft',
        provider: 'gamma',
        createdById: auth.user.id,
      })
      .returning();
    if (!presRow) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create presentation');
    }

    let jobRow: typeof gammaGenerationJobs.$inferSelect | undefined;
    try {
      const inserted = await db
        .insert(gammaGenerationJobs)
        .values({
          courseId,
          presentationId: presRow.id,
          requestedById: auth.user.id,
          status: 'pending',
          gammaGenerationId: created.generationId,
          materialIds: input.materialIds,
          requestParams: { ...input, inputTextChars: inputText.length },
        })
        .returning();
      jobRow = inserted[0];
      if (!jobRow) {
        throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create gamma job');
      }
    } catch (err) {
      try {
        await db.delete(presentations).where(eq(presentations.id, presRow.id));
      } catch (cleanupErr) {
        console.error('gamma: failed to roll back orphan presentation', {
          presentationId: presRow.id,
          err: cleanupErr,
        });
      }
      throw err;
    }

    const presentation = presRow;
    const job = jobRow;

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'gamma.generation.start',
      target: job.id,
      metadata: {
        courseId,
        presentationId: presentation.id,
        materialCount: materials.length,
      },
    });

    const body: CreateGammaPresentationResponse = {
      presentationId: presentation.id,
      jobId: job.id,
    };
    return success(c, body, 201);
  },
);

// -------- GET /api/courses/:courseId/gamma-jobs/pending --------

// Returns currently in-flight Gamma jobs for this course so the presentations
// page can resume polling them after a navigation/refresh. Without this, a
// job that was created in one session and never polled to completion sits
// frozen at `pending` because pollAndFinalize only runs on demand.
r.get(
  '/courses/:courseId/gamma-jobs/pending',
  requireScopeGroup('presentationsWrite'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const rows = await db
      .select()
      .from(gammaGenerationJobs)
      .where(
        and(
          eq(gammaGenerationJobs.courseId, courseId),
          eq(gammaGenerationJobs.status, 'pending'),
        ),
      );
    return success(c, { jobs: rows.map(toJobEnvelope) });
  },
);

// -------- GET /api/gamma-jobs/:jobId --------

// Job status reads are gated by the same authz as creation: only course staff
// see job lifecycle. Students consume the final published presentation, not
// the generation pipeline. We therefore use `presentationsWrite` so the API-
// token scope matches the course-staff auth check below — picking
// `presentationsRead` here would let an enrolled student's read-scoped token
// reach the route only to bounce on `canWriteCourse`, which is incoherent.
r.get('/gamma-jobs/:jobId', requireScopeGroup('presentationsWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const jobId = requireParam(c, 'jobId');

  const [job] = await db
    .select()
    .from(gammaGenerationJobs)
    .where(eq(gammaGenerationJobs.id, jobId))
    .limit(1);
  if (!job) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Gamma job not found');

  if (!(await canWriteCourse(db, auth.user, job.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this gamma job');
  }

  const client = clientOr500(c.env);
  const updated = await pollAndFinalize(jobId, {
    db,
    client,
    r2: c.env.COURSE_FILES,
    bucketName: c.env.R2_BUCKET ?? 'coursewise-files',
  });

  return success(c, toJobEnvelope(updated));
});

export default r;
