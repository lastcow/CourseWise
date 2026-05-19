import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { createDb } from '../db/client';
import {
  aiGenerationArtifacts,
  aiGenerationJobs,
  aiModels,
  aiProviders,
  courses,
  modules,
  readingMaterials,
} from '../db/schema';
import {
  callAnthropic,
  estimateCostCents,
  GatewayCallError,
  type AnthropicUsage,
} from '../services/ai/gateway';
import { recordEvent } from '../services/ai/events';
import type { AppBindings } from '../types';

export interface MaterialGenerationParams {
  jobId: string;
}

interface JobContext {
  courseId: string;
  createdBy: string;
  providerKind: 'anthropic';
  providerApiKeySecretRef: string;
  modelId: string;
  modelDbId: string;
  costInPer1m: number | null;
  costOutPer1m: number | null;
  language: 'en' | 'zh-CN';
  depth: 'brief' | 'standard' | 'detailed';
  instructions: string | null;
  moduleIds: string[];
  artifactIdByModuleId: Record<string, string>;
  systemCacheable: string;
}

const MAX_TOKENS_PER_DEPTH: Record<JobContext['depth'], number> = {
  brief: 1200,
  standard: 2400,
  detailed: 4500,
};

const WORD_TARGETS: Record<JobContext['depth'], string> = {
  brief: '~500 words',
  standard: '~1000 words',
  detailed: '~1800 words',
};

export class MaterialGenerationWorkflow extends WorkflowEntrypoint<
  AppBindings,
  MaterialGenerationParams
> {
  override async run(
    event: WorkflowEvent<MaterialGenerationParams>,
    step: WorkflowStep,
  ): Promise<void> {
    const { jobId } = event.payload;
    const env = this.env;

    const context = await step.do('load-context', () => this.loadContext(env, jobId));

    await step.do('mark-running', async () => {
      const db = createDb(env.DATABASE_URL);
      await db
        .update(aiGenerationJobs)
        .set({ status: 'running', startedAt: new Date().toISOString() })
        .where(eq(aiGenerationJobs.id, jobId));
      await recordEvent(
        db,
        jobId,
        null,
        'context.loaded',
        `Loaded course context (${context.systemCacheable.length} chars cacheable, ${context.moduleIds.length} module${context.moduleIds.length === 1 ? '' : 's'})`,
        { cacheableChars: context.systemCacheable.length, moduleCount: context.moduleIds.length },
      );
    });

    const totals: AnthropicUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    let succeeded = 0;
    let failed = 0;

    for (const moduleId of context.moduleIds) {
      const stepResult = await step.do(
        `generate-${moduleId}`,
        // Per-step config: retry transient errors a couple of times but don't
        // pound the upstream if it's a hard 4xx.
        { retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' } },
        () => this.generateMaterialForModule(env, jobId, moduleId, context),
      );
      if (stepResult.ok) {
        succeeded++;
        totals.inputTokens += stepResult.usage.inputTokens;
        totals.outputTokens += stepResult.usage.outputTokens;
        totals.cacheReadTokens += stepResult.usage.cacheReadTokens;
        totals.cacheCreationTokens += stepResult.usage.cacheCreationTokens;
      } else {
        failed++;
      }
    }

    await step.do('finalize', async () => {
      const db = createDb(env.DATABASE_URL);
      const status: 'succeeded' | 'partial' | 'failed' =
        failed === 0 ? 'succeeded' : succeeded === 0 ? 'failed' : 'partial';
      const cost = estimateCostCents(totals, context.costInPer1m, context.costOutPer1m);
      await db
        .update(aiGenerationJobs)
        .set({
          status,
          finishedAt: new Date().toISOString(),
          promptTokens: totals.inputTokens + totals.cacheReadTokens + totals.cacheCreationTokens,
          completionTokens: totals.outputTokens,
          costCents: cost,
          result: { succeededCount: succeeded, failedCount: failed, totals },
        })
        .where(eq(aiGenerationJobs.id, jobId));
      await recordEvent(
        db,
        jobId,
        null,
        'job.finished',
        `${succeeded} succeeded, ${failed} failed`,
        { status, totals, costCents: cost },
        failed > 0 && succeeded === 0 ? 'error' : 'info',
      );
    });
  }

  private async loadContext(env: AppBindings, jobId: string): Promise<JobContext> {
    const db = createDb(env.DATABASE_URL);
    const jobRows = await db
      .select()
      .from(aiGenerationJobs)
      .where(eq(aiGenerationJobs.id, jobId))
      .limit(1);
    const job = jobRows[0];
    if (!job) throw new Error(`Job ${jobId} not found`);

    const modelRows = await db
      .select({ model: aiModels, provider: aiProviders })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .where(eq(aiModels.id, job.modelId))
      .limit(1);
    const modelRow = modelRows[0];
    if (!modelRow) throw new Error(`Model ${job.modelId} not found`);
    if (modelRow.provider.kind !== 'anthropic') {
      throw new Error(
        `Phase 2 only supports Anthropic providers; got ${modelRow.provider.kind}.`,
      );
    }

    const courseRows = await db
      .select()
      .from(courses)
      .where(eq(courses.id, job.courseId))
      .limit(1);
    const course = courseRows[0];
    if (!course) throw new Error(`Course ${job.courseId} not found`);

    const artifacts = await db
      .select()
      .from(aiGenerationArtifacts)
      .where(eq(aiGenerationArtifacts.jobId, jobId));
    const artifactByModule: Record<string, string> = {};
    const moduleIds: string[] = [];
    for (const a of artifacts) {
      if (a.kind === 'material' && a.moduleId) {
        moduleIds.push(a.moduleId);
        artifactByModule[a.moduleId] = a.id;
      }
    }

    const request = (job.request as Record<string, unknown>) ?? {};
    const language = (request.language as 'en' | 'zh-CN' | undefined) ?? 'en';
    const depth = (request.depth as 'brief' | 'standard' | 'detailed' | undefined) ?? 'standard';
    const instructions =
      typeof request.instructions === 'string' && request.instructions.trim()
        ? (request.instructions as string).trim()
        : null;

    // Pull module titles for the system prompt so cross-module context is set
    // exactly once and cached.
    const moduleRows = await db.select().from(modules).where(eq(modules.courseId, course.id));
    const moduleSummary = moduleRows
      .map((m, idx) => `${idx + 1}. ${m.title}${m.description ? ` — ${m.description}` : ''}`)
      .join('\n');

    const systemCacheable = buildSystemPrompt({
      course: {
        title: course.title,
        code: course.code,
        termLabel: course.termLabel,
        description: course.description,
      },
      moduleSummary,
      language,
      depth,
      instructions,
    });

    return {
      courseId: course.id,
      createdBy: job.createdBy,
      providerKind: 'anthropic',
      providerApiKeySecretRef: modelRow.provider.apiKeySecretRef,
      modelId: modelRow.model.modelId,
      modelDbId: modelRow.model.id,
      costInPer1m: modelRow.model.costInPer1m == null ? null : Number(modelRow.model.costInPer1m),
      costOutPer1m: modelRow.model.costOutPer1m == null ? null : Number(modelRow.model.costOutPer1m),
      language,
      depth,
      instructions,
      moduleIds,
      artifactIdByModuleId: artifactByModule,
      systemCacheable,
    };
  }

  private async generateMaterialForModule(
    env: AppBindings,
    jobId: string,
    moduleId: string,
    context: JobContext,
  ): Promise<{ ok: true; usage: AnthropicUsage } | { ok: false; usage: AnthropicUsage }> {
    const db = createDb(env.DATABASE_URL);
    const artifactId = context.artifactIdByModuleId[moduleId];

    const markRunning = artifactId
      ? db
          .update(aiGenerationArtifacts)
          .set({ status: 'running' })
          .where(eq(aiGenerationArtifacts.id, artifactId))
      : Promise.resolve();
    await markRunning;

    const moduleRows = await db
      .select()
      .from(modules)
      .where(and(eq(modules.id, moduleId), eq(modules.courseId, context.courseId)))
      .limit(1);
    const mod = moduleRows[0];
    if (!mod) {
      if (artifactId) {
        await db
          .update(aiGenerationArtifacts)
          .set({ status: 'failed', error: 'module-not-found' })
          .where(eq(aiGenerationArtifacts.id, artifactId));
      }
      return { ok: false, usage: emptyUsage() };
    }

    const userMessage =
      `Write a reading material for the module titled "${mod.title}".` +
      (mod.description ? ` Module description: ${mod.description}` : '');

    await recordEvent(
      db,
      jobId,
      artifactId ?? null,
      'artifact.calling_model',
      `Calling ${context.modelId} for module "${mod.title}"`,
      { moduleId, modelId: context.modelId, moduleTitle: mod.title },
    );

    let usage = emptyUsage();
    let text = '';
    try {
      const res = await callAnthropic({
        env,
        provider: {
          kind: 'anthropic',
          apiKeySecretRef: context.providerApiKeySecretRef,
        },
        model: context.modelId,
        system: { cacheable: context.systemCacheable },
        userMessage,
        maxTokens: MAX_TOKENS_PER_DEPTH[context.depth],
        timeoutMs: 90_000,
      });
      usage = res.usage;
      text = res.text.trim();
      if (!text) throw new Error('Empty response from model.');
      await recordEvent(
        db,
        jobId,
        artifactId ?? null,
        'artifact.model_responded',
        `Got ${usage.outputTokens} output token${usage.outputTokens === 1 ? '' : 's'}`,
        { usage },
      );
    } catch (err) {
      const msg =
        err instanceof GatewayCallError
          ? `gateway-${err.status}: ${err.body.slice(0, 200)}`
          : err instanceof Error
            ? err.message
            : 'unknown-error';
      if (artifactId) {
        await db
          .update(aiGenerationArtifacts)
          .set({ status: 'failed', error: msg })
          .where(eq(aiGenerationArtifacts.id, artifactId));
      }
      await recordEvent(
        db,
        jobId,
        artifactId ?? null,
        'artifact.failed',
        msg,
        { moduleId },
        'error',
      );
      return { ok: false, usage };
    }

    // Per the chosen overwrite policy, always create a new draft. The title is
    // derived from the module so the teacher can locate it in the materials UI.
    const title = `${mod.title} — AI draft`;
    const inserted = await db
      .insert(readingMaterials)
      .values({
        courseId: context.courseId,
        moduleId,
        title,
        sourceType: 'manual_text',
        status: 'draft',
        content: text,
        createdById: context.createdBy,
      })
      .returning({ id: readingMaterials.id });
    const materialId = inserted[0]?.id ?? null;

    if (artifactId) {
      await db
        .update(aiGenerationArtifacts)
        .set({ status: 'succeeded', artifactId: materialId })
        .where(eq(aiGenerationArtifacts.id, artifactId));
    }

    await recordEvent(
      db,
      jobId,
      artifactId ?? null,
      'artifact.saved',
      `Saved draft "${title}"`,
      { moduleId, materialId },
    );

    return { ok: true, usage };
  }
}

function emptyUsage(): AnthropicUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

function buildSystemPrompt(args: {
  course: {
    title: string;
    code: string;
    termLabel: string | null;
    description: string | null;
  };
  moduleSummary: string;
  language: 'en' | 'zh-CN';
  depth: 'brief' | 'standard' | 'detailed';
  instructions: string | null;
}): string {
  const langLine =
    args.language === 'zh-CN' ? 'Write in Simplified Chinese.' : 'Write in English.';
  return [
    'You are a curriculum-design assistant for a teaching platform.',
    'You write reading materials that are clear, structured, and pedagogically sound.',
    '',
    `Course: ${args.course.title} (${args.course.code})`,
    args.course.termLabel ? `Term: ${args.course.termLabel}` : null,
    args.course.description ? `Description: ${args.course.description}` : null,
    '',
    'Course modules:',
    args.moduleSummary || '(none)',
    '',
    'When asked to write a reading material for a specific module, follow these rules:',
    '- Output valid Markdown only — no preamble, no commentary, no code fences around the whole thing.',
    '- Begin with a single H2 heading derived from the module title.',
    '- Include a 1–2 paragraph overview, 3–6 main sections each under an H3 heading, and a short summary at the end.',
    '- Use concrete examples where they aid understanding.',
    `- Target length: ${WORD_TARGETS[args.depth]}.`,
    `- ${langLine}`,
    '- Do not duplicate content that obviously belongs to other modules in this course.',
    args.instructions ? '' : null,
    args.instructions ? `Additional instructions from the teacher: ${args.instructions}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}
