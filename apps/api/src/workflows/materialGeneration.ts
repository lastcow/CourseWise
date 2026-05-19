import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { createDb } from '../db/client';
import {
  aiGenerationArtifacts,
  aiGenerationJobs,
  aiModels,
  aiPromptTemplates,
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
import { interpolate } from '../services/ai/interpolate';
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
  courseTitle: string;
  courseCode: string;
  courseTermLabel: string | null;
  courseDescription: string | null;
  moduleSummary: string;
  template: {
    systemPrompt: string;
    userMessage: string;
    depthConfig: {
      brief: { wordTarget: string; maxTokens: number };
      standard: { wordTarget: string; maxTokens: number };
      detailed: { wordTarget: string; maxTokens: number };
    };
  };
}

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
        `Loaded course context (${context.template.systemPrompt.length} chars in template, ${context.moduleIds.length} module${context.moduleIds.length === 1 ? '' : 's'})`,
        { templateChars: context.template.systemPrompt.length, moduleCount: context.moduleIds.length },
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
      const finishedLevel: 'info' | 'warn' | 'error' =
        status === 'failed' ? 'error' : status === 'partial' ? 'warn' : 'info';
      await recordEvent(
        db,
        jobId,
        null,
        'job.finished',
        `${succeeded} succeeded, ${failed} failed`,
        { status, totals, costCents: cost },
        finishedLevel,
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

    const templateRows = await db
      .select()
      .from(aiPromptTemplates)
      .where(eq(aiPromptTemplates.kind, 'material'))
      .limit(1);
    const templateRow = templateRows[0];
    if (!templateRow) {
      throw new Error('Prompt template for kind "material" is missing — run the 0009 migration.');
    }

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
      courseTitle: course.title,
      courseCode: course.code,
      courseTermLabel: course.termLabel,
      courseDescription: course.description,
      moduleSummary,
      template: {
        systemPrompt: templateRow.systemPrompt,
        userMessage: templateRow.userMessage,
        depthConfig: templateRow.depthConfig,
      },
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
      await recordEvent(
        db,
        jobId,
        artifactId ?? null,
        'artifact.failed',
        'Module not found',
        { moduleId },
        'error',
      );
      return { ok: false, usage: emptyUsage() };
    }

    const langLine =
      context.language === 'zh-CN' ? 'Write in Simplified Chinese.' : 'Write in English.';
    const depthEntry = context.template.depthConfig[context.depth];
    const systemPrompt = interpolate(context.template.systemPrompt, {
      'course.title': context.courseTitle,
      'course.code': context.courseCode,
      'course.termLabel': context.courseTermLabel
        ? `Term: ${context.courseTermLabel}`
        : '',
      'course.description': context.courseDescription
        ? `Description: ${context.courseDescription}`
        : '',
      moduleSummary: context.moduleSummary || '(none)',
      language: langLine,
      wordTarget: depthEntry.wordTarget,
      teacherInstructions: context.instructions
        ? `Additional instructions from the teacher: ${context.instructions}`
        : '',
    });

    const userMessage = interpolate(context.template.userMessage, {
      'module.title': mod.title,
      'module.description': mod.description ? ` Module description: ${mod.description}` : '',
    });

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
        system: { cacheable: systemPrompt },
        userMessage,
        maxTokens: depthEntry.maxTokens,
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

