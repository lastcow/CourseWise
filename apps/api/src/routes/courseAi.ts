import { Hono } from 'hono';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  generateMaterialsSchema,
  type AiJobArtifact,
  type AiJobDetail,
  type AiJobEvent,
  type AiJobSummary,
  type AiModelOption,
  type AiProviderKind,
  type GenerateMaterialsInput,
} from '@coursewise/shared';
import {
  aiGenerationArtifacts,
  aiGenerationEvents,
  aiGenerationJobs,
  aiModels,
  aiProviders,
  modules,
  readingMaterials,
} from '../db/schema';
import { hasProviderSecret } from '../services/ai/gateway';
import { recordAudit } from '../services/audit';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { validateJson } from '../middleware/validate';
import { requireAuth, requireCourseTeacher } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import type { AppEnv } from '../types';

const courseAi = new Hono<AppEnv>();

courseAi.use('*', requireAuth);

// ---------- GET enabled models the teacher can pick ----------
courseAi.get(
  '/courses/:courseId/ai/models',
  requireScopeGroup('aiJobsRead'),
  requireCourseTeacher('courseId'),
  async (c) => {
    const db = c.get('db');
    const rows = await db
      .select({ model: aiModels, provider: aiProviders })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .where(and(eq(aiModels.enabled, true), eq(aiProviders.enabled, true)))
      .orderBy(asc(aiProviders.kind), asc(aiModels.modelId));
    const models: AiModelOption[] = rows
      // Only surface providers whose Worker secret is actually bound — otherwise
      // the job would fail on its first call.
      .filter((r) => hasProviderSecret(c.env, r.provider.apiKeySecretRef))
      .map((r) => ({
        id: r.model.id,
        providerKind: r.provider.kind as AiProviderKind,
        modelId: r.model.modelId,
        displayName: r.model.displayName,
        costInPer1m: r.model.costInPer1m == null ? null : Number(r.model.costInPer1m),
        costOutPer1m: r.model.costOutPer1m == null ? null : Number(r.model.costOutPer1m),
      }));
    return success(c, { models });
  },
);

// ---------- POST create a generation job ----------
courseAi.post(
  '/courses/:courseId/ai/generate',
  requireScopeGroup('aiJobsWrite'),
  requireCourseTeacher('courseId'),
  validateJson(generateMaterialsSchema),
  async (c) => {
    const courseId = c.req.param('courseId');
    const input = c.get('validated') as GenerateMaterialsInput;
    const auth = c.get('auth');
    const db = c.get('db');

    // Verify model is enabled and its provider has a secret bound.
    const modelRows = await db
      .select({ model: aiModels, provider: aiProviders })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .where(eq(aiModels.id, input.modelId))
      .limit(1);
    const modelRow = modelRows[0];
    if (!modelRow || !modelRow.model.enabled || !modelRow.provider.enabled) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Model is not available.');
    }
    if (modelRow.provider.kind !== 'anthropic') {
      // Phase 2 only wires Anthropic. Other providers reach this once Phase 3
      // adds adapters.
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'This release only supports Anthropic models.',
      );
    }
    if (!hasProviderSecret(c.env, modelRow.provider.apiKeySecretRef)) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Provider secret is not configured.',
      );
    }

    // Restrict moduleIds to ones that belong to this course.
    const moduleRows = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.courseId, courseId), inArray(modules.id, input.moduleIds)));
    if (moduleRows.length !== input.moduleIds.length) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'One or more modules do not belong to this course.',
      );
    }

    // Persist the job + per-module artifact placeholders before kicking off the
    // workflow so the polling endpoint has a complete picture immediately.
    const [jobRow] = await db
      .insert(aiGenerationJobs)
      .values({
        courseId,
        createdBy: auth.user.id,
        modelId: input.modelId,
        status: 'queued',
        request: input as unknown as Record<string, unknown>,
      })
      .returning();
    if (!jobRow) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create job');
    }

    await db.insert(aiGenerationArtifacts).values(
      input.moduleIds.map((moduleId) => ({
        jobId: jobRow.id,
        kind: 'material' as const,
        moduleId,
        status: 'pending' as const,
      })),
    );

    if (!c.env.MATERIAL_GEN_WORKFLOW) {
      // The Workflow binding is required for this endpoint to actually do
      // anything. We still create the job row so the failure is visible in
      // history rather than swallowed silently.
      await db
        .update(aiGenerationJobs)
        .set({
          status: 'failed',
          error: 'workflow-binding-missing',
          finishedAt: new Date().toISOString(),
        })
        .where(eq(aiGenerationJobs.id, jobRow.id));
      throw new ApiException(
        503,
        ERROR_CODES.INTERNAL_ERROR,
        'AI generation is not enabled in this environment.',
      );
    }

    await c.env.MATERIAL_GEN_WORKFLOW.create({
      id: jobRow.id,
      params: { jobId: jobRow.id },
    });

    await recordAudit(db, {
      actorType: auth.method === 'api_token' ? 'api_token' : 'user',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.ai.generate.create',
      target: jobRow.id,
      metadata: { courseId, modelId: input.modelId, moduleCount: input.moduleIds.length },
    });

    return success(c, { jobId: jobRow.id }, 202);
  },
);

// ---------- GET list of jobs for this course ----------
courseAi.get(
  '/courses/:courseId/ai/jobs',
  requireScopeGroup('aiJobsRead'),
  requireCourseTeacher('courseId'),
  async (c) => {
    const courseId = c.req.param('courseId');
    const db = c.get('db');

    const jobRows = await db
      .select({
        job: aiGenerationJobs,
        modelDisplayName: aiModels.displayName,
      })
      .from(aiGenerationJobs)
      .leftJoin(aiModels, eq(aiGenerationJobs.modelId, aiModels.id))
      .where(eq(aiGenerationJobs.courseId, courseId))
      .orderBy(desc(aiGenerationJobs.createdAt))
      .limit(50);

    if (jobRows.length === 0) return success(c, { jobs: [] as AiJobSummary[] });

    const jobIds = jobRows.map((r) => r.job.id);
    const artifactStats = await db
      .select({
        jobId: aiGenerationArtifacts.jobId,
        total: count(),
        succeeded: sql<number>`sum(case when ${aiGenerationArtifacts.status} = 'succeeded' then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${aiGenerationArtifacts.status} = 'failed' then 1 else 0 end)`,
      })
      .from(aiGenerationArtifacts)
      .where(inArray(aiGenerationArtifacts.jobId, jobIds))
      .groupBy(aiGenerationArtifacts.jobId);
    const statsByJob = new Map(artifactStats.map((s) => [s.jobId, s]));

    const jobs: AiJobSummary[] = jobRows.map((r) => {
      const stats = statsByJob.get(r.job.id);
      return {
        id: r.job.id,
        status: r.job.status,
        modelDisplayName: r.modelDisplayName ?? '',
        artifactCount: Number(stats?.total ?? 0),
        succeededCount: Number(stats?.succeeded ?? 0),
        failedCount: Number(stats?.failed ?? 0),
        costCents: r.job.costCents,
        startedAt: r.job.startedAt,
        finishedAt: r.job.finishedAt,
        createdAt: r.job.createdAt,
      };
    });

    return success(c, { jobs });
  },
);

// ---------- GET one job with its artifacts ----------
courseAi.get(
  '/courses/:courseId/ai/jobs/:jobId',
  requireScopeGroup('aiJobsRead'),
  requireCourseTeacher('courseId'),
  async (c) => {
    const courseId = c.req.param('courseId');
    const jobId = c.req.param('jobId');
    const db = c.get('db');

    const jobRows = await db
      .select({ job: aiGenerationJobs, modelDisplayName: aiModels.displayName })
      .from(aiGenerationJobs)
      .leftJoin(aiModels, eq(aiGenerationJobs.modelId, aiModels.id))
      .where(and(eq(aiGenerationJobs.id, jobId), eq(aiGenerationJobs.courseId, courseId)))
      .limit(1);
    const row = jobRows[0];
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Job not found');

    const [artifacts, eventRows] = await Promise.all([
      db
        .select({
          artifact: aiGenerationArtifacts,
          moduleTitle: modules.title,
          materialTitle: readingMaterials.title,
        })
        .from(aiGenerationArtifacts)
        .leftJoin(modules, eq(modules.id, aiGenerationArtifacts.moduleId))
        .leftJoin(readingMaterials, eq(readingMaterials.id, aiGenerationArtifacts.artifactId))
        .where(eq(aiGenerationArtifacts.jobId, jobId)),
      db
        .select()
        .from(aiGenerationEvents)
        .where(eq(aiGenerationEvents.jobId, jobId))
        .orderBy(asc(aiGenerationEvents.occurredAt), asc(aiGenerationEvents.id)),
    ]);

    let succeededCount = 0;
    let failedCount = 0;
    const out: AiJobArtifact[] = artifacts.map((a) => {
      if (a.artifact.status === 'succeeded') succeededCount++;
      if (a.artifact.status === 'failed') failedCount++;
      return {
        id: a.artifact.id,
        kind: a.artifact.kind,
        status: a.artifact.status,
        moduleId: a.artifact.moduleId,
        moduleTitle: a.moduleTitle,
        artifactId: a.artifact.artifactId,
        artifactTitle: a.materialTitle,
        error: a.artifact.error,
      };
    });

    const events: AiJobEvent[] = eventRows.map((e) => ({
      id: e.id,
      artifactId: e.artifactId,
      level: e.level,
      type: e.type,
      message: e.message,
      metadata: e.metadata,
      occurredAt: e.occurredAt,
    }));

    const detail: AiJobDetail = {
      id: row.job.id,
      status: row.job.status,
      modelDisplayName: row.modelDisplayName ?? '',
      artifactCount: artifacts.length,
      succeededCount,
      failedCount,
      costCents: row.job.costCents,
      startedAt: row.job.startedAt,
      finishedAt: row.job.finishedAt,
      createdAt: row.job.createdAt,
      request: row.job.request as unknown as GenerateMaterialsInput,
      artifacts: out,
      events,
    };

    return success(c, detail);
  },
);

export default courseAi;
