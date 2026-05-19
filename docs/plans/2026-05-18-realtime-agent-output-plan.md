# Realtime Agent Output Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let teachers watch an AI generation job's step-by-step activity (loaded context → calling model → got response → saved draft) in a collapsible "Activity" timeline that updates while the job runs.

**Architecture:** Append progress events to a new `ai_generation_events` table from the existing `MaterialGenerationWorkflow` and from the job-creation route. Extend the existing `GET /api/courses/:id/ai/jobs/:jobId` response with an `events: AiJobEvent[]` field. Add an inline expandable timeline to `GenerationHistoryCard` (clicking a job toggles its events panel) — no new page or route. The existing 2-second polling on `useCourseAiJob` keeps events fresh while the job is running; no SSE, no streaming.

**Tech Stack:** Drizzle (Postgres), Hono on Cloudflare Workers, Cloudflare Workflows, React + TanStack Query, react-i18next, Vitest.

**Design reference:** `docs/plans/2026-05-18-realtime-agent-output-design.md`

---

## Task 1 — Drizzle schema + migration for `ai_generation_events`

**Files:**
- Modify: `apps/api/src/db/schema.ts` (append new `pgEnum` + `pgTable`)
- Create: `apps/api/drizzle/0008_ai_generation_events.sql`

**Step 1: Add enum + table to `schema.ts`**

Append immediately after the existing `aiArtifactStatusEnum` block (around line 110):

```ts
export const aiEventLevelEnum = pgEnum('ai_event_level', ['info', 'warn', 'error']);
```

Append immediately after the `aiGenerationArtifacts` block (around line 924):

```ts
export const aiGenerationEvents = pgTable(
  'ai_generation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => aiGenerationJobs.id, { onDelete: 'cascade' }),
    artifactId: uuid('artifact_id').references(() => aiGenerationArtifacts.id, {
      onDelete: 'cascade',
    }),
    level: aiEventLevelEnum('level').notNull().default('info'),
    type: text('type').notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    jobOccurredIdx: index('ai_generation_events_job_occurred_idx').on(t.jobId, t.occurredAt),
  }),
);

export type AiGenerationEventRow = typeof aiGenerationEvents.$inferSelect;
```

**Step 2: Write the migration SQL `0008_ai_generation_events.sql`**

Follow the same `DO $$ … EXCEPTION WHEN duplicate_object` style as `0007_ai_foundation.sql`.

```sql
DO $$ BEGIN
 CREATE TYPE "ai_event_level" AS ENUM ('info', 'warn', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_generation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "artifact_id" uuid,
  "level" "ai_event_level" DEFAULT 'info' NOT NULL,
  "type" text NOT NULL,
  "message" text NOT NULL,
  "metadata" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_generation_events" ADD CONSTRAINT "ai_generation_events_job_id_fkey"
   FOREIGN KEY ("job_id") REFERENCES "ai_generation_jobs"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_generation_events" ADD CONSTRAINT "ai_generation_events_artifact_id_fkey"
   FOREIGN KEY ("artifact_id") REFERENCES "ai_generation_artifacts"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generation_events_job_occurred_idx"
  ON "ai_generation_events" ("job_id", "occurred_at");
```

Also update `apps/api/drizzle/meta/_journal.json` — drizzle tracks the journal. Easier: regenerate with `pnpm db:generate`, accept its output, then **diff against the hand-written SQL above** and prefer the hand-written one for the FK pattern. If they differ in shape (column types/names), trust the generated one and update the table above.

**Step 3: Apply locally**

```bash
cd /Users/zhijiangchen/CourseWise/apps/api
pnpm db:migrate
```

Expected: prints the new migration name, exits 0.

**Step 4: Verify in psql**

```bash
psql "$(grep DATABASE_URL apps/api/.dev.vars | cut -d= -f2-)" -c "\d ai_generation_events"
```

Expected: shows columns `id, job_id, artifact_id, level, type, message, metadata, occurred_at` and the `_job_occurred_idx` index.

**Step 5: Typecheck**

```bash
cd apps/api && pnpm typecheck
```

Expected: 0 errors.

**Step 6: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/0008_ai_generation_events.sql apps/api/drizzle/meta/
git commit -m "feat(ai): add ai_generation_events table"
```

---

## Task 2 — `AiJobEvent` shared type

**Files:**
- Modify: `packages/shared/src/validators.ts` (after `AiJobArtifact`, before `AiJobDetail`)

**Step 1: Add the type**

```ts
export interface AiJobEvent {
  id: string;
  artifactId: string | null;
  level: 'info' | 'warn' | 'error';
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  occurredAt: string; // ISO string
}
```

**Step 2: Extend `AiJobDetail`**

```ts
export interface AiJobDetail extends AiJobSummary {
  request: GenerateMaterialsInput;
  artifacts: AiJobArtifact[];
  events: AiJobEvent[]; // ordered ascending by occurredAt
}
```

**Step 3: Typecheck both packages**

```bash
cd packages/shared && pnpm typecheck
cd ../../apps/api && pnpm typecheck
cd ../web && pnpm typecheck
```

Expected: `apps/api` will fail because `courseAi.ts` doesn't yet return `events`. That's intentional — Task 4 fixes it.

**Step 4: Commit**

```bash
git add packages/shared/src/validators.ts
git commit -m "feat(ai): add AiJobEvent shared type"
```

---

## Task 3 — `recordEvent` helper in the workflow service

**Files:**
- Create: `apps/api/src/services/ai/events.ts`
- Test: `apps/api/src/services/ai/events.test.ts`

**Step 1: Write the failing test**

```ts
// apps/api/src/services/ai/events.test.ts
import { describe, expect, it, vi } from 'vitest';
import { recordEvent } from './events';

describe('recordEvent', () => {
  it('inserts one row with default level=info and undefined metadata as null', async () => {
    const inserts: unknown[] = [];
    const db = {
      insert: () => ({
        values: (v: unknown) => {
          inserts.push(v);
          return Promise.resolve();
        },
      }),
    } as unknown as Parameters<typeof recordEvent>[0];

    await recordEvent(db, 'job-1', null, 'job.started', 'hi');

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      jobId: 'job-1',
      artifactId: null,
      level: 'info',
      type: 'job.started',
      message: 'hi',
      metadata: null,
    });
  });

  it('swallows errors so a failed event write never breaks the caller', async () => {
    const db = {
      insert: () => ({
        values: () => Promise.reject(new Error('db down')),
      }),
    } as unknown as Parameters<typeof recordEvent>[0];

    await expect(
      recordEvent(db, 'job-1', null, 'job.started', 'hi'),
    ).resolves.toBeUndefined();
  });

  it('writes warn level + metadata when provided', async () => {
    const inserts: unknown[] = [];
    const db = {
      insert: () => ({
        values: (v: unknown) => {
          inserts.push(v);
          return Promise.resolve();
        },
      }),
    } as unknown as Parameters<typeof recordEvent>[0];

    await recordEvent(db, 'j', 'a', 'artifact.failed', 'boom', { code: 401 }, 'warn');

    expect(inserts[0]).toMatchObject({
      jobId: 'j',
      artifactId: 'a',
      level: 'warn',
      metadata: { code: 401 },
    });
  });
});
```

Run: `cd apps/api && pnpm test src/services/ai/events.test.ts`
Expected: FAIL with "Cannot find module './events'".

**Step 2: Implement the helper**

```ts
// apps/api/src/services/ai/events.ts
import type { Db } from '../../db/client';
import { aiGenerationEvents } from '../../db/schema';

/**
 * Append a progress event to a job. Errors are swallowed — recording
 * telemetry must never fail the parent step.
 */
export async function recordEvent(
  db: Db,
  jobId: string,
  artifactId: string | null,
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
): Promise<void> {
  try {
    await db.insert(aiGenerationEvents).values({
      jobId,
      artifactId,
      level,
      type,
      message,
      metadata: metadata ?? null,
    });
  } catch {
    // intentionally swallowed — see jsdoc
  }
}
```

**Step 3: Run tests**

Run: `cd apps/api && pnpm test src/services/ai/events.test.ts`
Expected: 3 passed.

**Step 4: Commit**

```bash
git add apps/api/src/services/ai/events.ts apps/api/src/services/ai/events.test.ts
git commit -m "feat(ai): recordEvent helper"
```

---

## Task 4 — Return events from `GET /ai/jobs/:jobId`

**Files:**
- Modify: `apps/api/src/routes/courseAi.ts`

**Step 1: Add the events query in the detail handler**

After the `artifacts` query (currently at line 251–260), before the `succeededCount/failedCount` loop, add:

```ts
const eventRows = await db
  .select()
  .from(aiGenerationEvents)
  .where(eq(aiGenerationEvents.jobId, jobId))
  .orderBy(asc(aiGenerationEvents.occurredAt));
```

Add `aiGenerationEvents` to the schema imports at the top (around line 13–19):

```ts
import {
  aiGenerationArtifacts,
  aiGenerationEvents,
  aiGenerationJobs,
  aiModels,
  aiProviders,
  modules,
  readingMaterials,
} from '../db/schema';
```

Add `AiJobEvent` to the shared import.

**Step 2: Map rows → `AiJobEvent[]`**

Right before building the `detail` object, add:

```ts
const events: AiJobEvent[] = eventRows.map((e) => ({
  id: e.id,
  artifactId: e.artifactId,
  level: e.level,
  type: e.type,
  message: e.message,
  metadata: (e.metadata as Record<string, unknown> | null) ?? null,
  occurredAt: e.occurredAt,
}));
```

Then add `events` to the `detail` object literal (after `artifacts: out`):

```ts
const detail: AiJobDetail = {
  // ...existing fields...
  artifacts: out,
  events,
};
```

**Step 3: Typecheck**

```bash
cd apps/api && pnpm typecheck
```
Expected: 0 errors.

**Step 4: Smoke-test against the real DB**

```bash
psql "$(grep DATABASE_URL apps/api/.dev.vars | cut -d= -f2-)" -c "
  INSERT INTO ai_generation_events (job_id, type, message)
  SELECT id, 'job.started', 'manual test event' FROM ai_generation_jobs LIMIT 1;
"
```

Then start the worker (`pnpm --filter @coursewise/api dev` in one shell) and hit the route from another:

```bash
curl -s -H "Authorization: Bearer <teacher-token>" \
  http://localhost:8787/api/courses/<courseId>/ai/jobs/<jobId> | jq '.data.events'
```

Expected: the test event appears with `level: "info"`, `type: "job.started"`, `message: "manual test event"`.

Clean up: `DELETE FROM ai_generation_events WHERE message = 'manual test event';`

**Step 5: Commit**

```bash
git add apps/api/src/routes/courseAi.ts
git commit -m "feat(ai): return events array from job detail endpoint"
```

---

## Task 5 — Emit `job.started` from the job-creation route

**Files:**
- Modify: `apps/api/src/routes/courseAi.ts` (the `POST /ai/generate` handler)

**Step 1: Emit the event before kicking off the workflow**

Right after the artifact-placeholders insert (currently lines 131–138) and **before** the `if (!c.env.MATERIAL_GEN_WORKFLOW)` check, add:

```ts
await recordEvent(
  db,
  jobRow.id,
  null,
  'job.started',
  `Starting reading-material generation for ${input.moduleIds.length} module${input.moduleIds.length === 1 ? '' : 's'}`,
  { modelId: input.modelId, moduleCount: input.moduleIds.length },
);
```

Add the import at the top:

```ts
import { hasProviderSecret } from '../services/ai/gateway';
import { recordEvent } from '../services/ai/events';
```

**Step 2: Verify**

Run a real generation (via the UI or `curl`), then:

```bash
psql "$DATABASE_URL" -c "SELECT type, message FROM ai_generation_events ORDER BY occurred_at DESC LIMIT 5;"
```

Expected: the most recent row is `job.started` with the matching message.

**Step 3: Typecheck + tests**

```bash
cd apps/api && pnpm typecheck && pnpm test
```
Expected: 0 typecheck errors; all tests pass.

**Step 4: Commit**

```bash
git add apps/api/src/routes/courseAi.ts
git commit -m "feat(ai): emit job.started event on job creation"
```

---

## Task 6 — Emit events from `MaterialGenerationWorkflow`

**Files:**
- Modify: `apps/api/src/workflows/materialGeneration.ts`

**Step 1: Import `recordEvent`**

```ts
import { recordEvent } from '../services/ai/events';
```

**Step 2: `context.loaded` — inside `mark-running` step**

Replace the `mark-running` step body (lines 67–73) with:

```ts
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
```

**Step 3: Per-artifact events inside `generateMaterialForModule`**

The method already takes `env`, `moduleId`, and `context`. Pass `jobId` into it. Update the call site:

```ts
const stepResult = await step.do(
  `generate-${moduleId}`,
  { retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' } },
  () => this.generateMaterialForModule(env, jobId, moduleId, context),
);
```

And the signature:

```ts
private async generateMaterialForModule(
  env: AppBindings,
  jobId: string,
  moduleId: string,
  context: JobContext,
): Promise<{ ok: true; usage: AnthropicUsage } | { ok: false; usage: AnthropicUsage }>
```

Inside the method, add four event emissions:

a) **Right after `markRunning`**, before the module lookup:

```ts
await recordEvent(
  db,
  jobId,
  artifactId ?? null,
  'artifact.calling_model',
  `Calling ${context.modelId} for module`,
  { moduleId, modelId: context.modelId },
);
```

(We log a more specific message once we have `mod.title`; this first one is the boundary marker before the lookup so the user sees activity even if module lookup fails.)

b) **Inside the `mod` block**, replace the call site so we emit `artifact.calling_model` again with the module title for clarity. Simplest: drop (a) and instead emit once after we have `mod`:

Actually do **only** one emission, after the `mod` lookup, before `callAnthropic`:

```ts
await recordEvent(
  db,
  jobId,
  artifactId ?? null,
  'artifact.calling_model',
  `Calling ${context.modelId} for module "${mod.title}"`,
  { moduleId, modelId: context.modelId, moduleTitle: mod.title },
);
```

c) **After a successful `callAnthropic`** (right after `text = res.text.trim()`; before the empty-text check or move below it for the saved branch — easier to put it right after the check):

```ts
await recordEvent(
  db,
  jobId,
  artifactId ?? null,
  'artifact.model_responded',
  `Got ${usage.outputTokens} output token${usage.outputTokens === 1 ? '' : 's'}`,
  { usage },
);
```

d) **On error**, in the `catch` block right before/after the artifact-failed DB update:

```ts
await recordEvent(
  db,
  jobId,
  artifactId ?? null,
  'artifact.failed',
  msg,
  { moduleId },
  'error',
);
```

e) **After a successful save**, right after the `aiGenerationArtifacts` update to `succeeded`:

```ts
await recordEvent(
  db,
  jobId,
  artifactId ?? null,
  'artifact.saved',
  `Saved draft "${title}"`,
  { moduleId, materialId },
);
```

**Step 4: `job.finished` — inside `finalize` step**

Replace the `finalize` step body (lines 103–123) so the closing event is emitted after the status update:

```ts
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
```

**Step 5: Typecheck + tests**

```bash
cd apps/api && pnpm typecheck && pnpm test
```
Expected: 0 errors. No existing test exercises the workflow runtime (Cloudflare Workflow needs the worker runtime), so this won't regress anything.

**Step 6: End-to-end smoke test**

Start the worker and submit a 1-module generation via the UI. Then:

```bash
psql "$DATABASE_URL" -c "
  SELECT type, message, occurred_at
  FROM ai_generation_events
  WHERE job_id = (SELECT id FROM ai_generation_jobs ORDER BY created_at DESC LIMIT 1)
  ORDER BY occurred_at;
"
```

Expected sequence: `job.started`, `context.loaded`, `artifact.calling_model`, `artifact.model_responded`, `artifact.saved`, `job.finished` (assuming success).

**Step 7: Commit**

```bash
git add apps/api/src/workflows/materialGeneration.ts
git commit -m "feat(ai): emit progress events through the material-generation workflow"
```

---

## Task 7 — Web: i18n strings + `useCourseAiJob` already exists, no change

**Files:**
- Modify: `apps/web/src/locales/en.ts`
- Modify: `apps/web/src/locales/zh-CN.ts`

**Step 1: Add timeline strings to `en.ts`** inside the `ai` block (alongside `history` / `jobStatus`):

```ts
activity: {
  title: 'Activity',
  showRealtime: 'Show realtime output',
  empty: 'No events yet.',
  metadataToggle: 'Details',
  relative: {
    justNow: 'just now',
    secondsAgo: '{{n}}s ago',
    minutesAgo: '{{n}}m ago',
  },
  eventType: {
    'job.started': 'Job started',
    'context.loaded': 'Context loaded',
    'artifact.calling_model': 'Calling model',
    'artifact.model_responded': 'Model responded',
    'artifact.saved': 'Saved',
    'artifact.failed': 'Artifact failed',
    'job.finished': 'Job finished',
  },
},
```

**Step 2: Mirror into `zh-CN.ts`** with the corresponding translations:

```ts
activity: {
  title: '活动',
  showRealtime: '显示实时输出',
  empty: '暂无事件。',
  metadataToggle: '详情',
  relative: {
    justNow: '刚刚',
    secondsAgo: '{{n}} 秒前',
    minutesAgo: '{{n}} 分钟前',
  },
  eventType: {
    'job.started': '任务开始',
    'context.loaded': '上下文已加载',
    'artifact.calling_model': '正在调用模型',
    'artifact.model_responded': '模型已响应',
    'artifact.saved': '已保存',
    'artifact.failed': '生成失败',
    'job.finished': '任务完成',
  },
},
```

**Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```
Expected: 0 errors.

**Step 4: Commit**

```bash
git add apps/web/src/locales/en.ts apps/web/src/locales/zh-CN.ts
git commit -m "i18n: add AI activity timeline strings"
```

---

## Task 8 — `JobActivityTimeline` component

**Files:**
- Create: `apps/web/src/components/ai/JobActivityTimeline.tsx`

**Step 1: Implement the component**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiJobEvent, AiJobStatus } from '@coursewise/shared';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'coursewise.ai.showAgentOutput';

function levelDot(level: AiJobEvent['level']): string {
  if (level === 'error') return 'bg-red-500';
  if (level === 'warn') return 'bg-amber-500';
  return 'bg-blue-500';
}

function relative(t: (k: string, v?: Record<string, unknown>) => string, isoTs: string): string {
  const delta = Math.max(0, Math.floor((Date.now() - new Date(isoTs).getTime()) / 1000));
  if (delta < 5) return t('ai.activity.relative.justNow');
  if (delta < 60) return t('ai.activity.relative.secondsAgo', { n: delta });
  return t('ai.activity.relative.minutesAgo', { n: Math.floor(delta / 60) });
}

function isRunning(status: AiJobStatus): boolean {
  return status === 'queued' || status === 'running';
}

function readInitialToggle(running: boolean): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch {
    /* SSR / disabled storage */
  }
  return running; // default: on while running, off when finished
}

type Props = {
  status: AiJobStatus;
  events: AiJobEvent[];
};

export function JobActivityTimeline({ status, events }: Props): JSX.Element {
  const { t } = useTranslation();
  const running = isRunning(status);
  const [show, setShow] = useState(() => readInitialToggle(running));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(show));
    } catch {
      /* ignore */
    }
  }, [show]);

  useEffect(() => {
    if (!show || !autoScroll || !running) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [show, autoScroll, running, events.length]);

  function onScroll(): void {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    setAutoScroll(atBottom);
  }

  return (
    <div className="mt-3 rounded border bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-sm font-medium">{t('ai.activity.title')}</div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          {t('ai.activity.showRealtime')}
        </label>
      </div>
      {show ? (
        <div
          ref={listRef}
          onScroll={onScroll}
          className="max-h-72 overflow-y-auto px-3 py-2"
        >
          {events.length === 0 ? (
            <div className="text-xs text-muted-foreground">{t('ai.activity.empty')}</div>
          ) : (
            <ol className="space-y-1.5">
              {events.map((ev) => {
                const isOpen = !!expanded[ev.id];
                const hasMetadata = ev.metadata != null && Object.keys(ev.metadata).length > 0;
                return (
                  <li key={ev.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={cn('mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full', levelDot(ev.level))}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">
                          {t(`ai.activity.eventType.${ev.type}`, { defaultValue: ev.type })}
                        </span>
                        <span className="text-muted-foreground">{ev.message}</span>
                        <span className="ml-auto text-muted-foreground">{relative(t, ev.occurredAt)}</span>
                      </div>
                      {hasMetadata ? (
                        <>
                          <button
                            type="button"
                            className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:underline"
                            onClick={() => setExpanded((m) => ({ ...m, [ev.id]: !isOpen }))}
                          >
                            {t('ai.activity.metadataToggle')}
                          </button>
                          {isOpen ? (
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug">
                              {JSON.stringify(ev.metadata, null, 2)}
                            </pre>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div ref={bottomRef} />
        </div>
      ) : null}
    </div>
  );
}
```

**Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```
Expected: 0 errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/ai/JobActivityTimeline.tsx
git commit -m "feat(ai): JobActivityTimeline component"
```

---

## Task 9 — Wire the timeline into `GenerationHistoryCard`

**Files:**
- Modify: `apps/web/src/components/ai/GenerationHistoryCard.tsx`

**Step 1: Make rows expandable, fetch the detail for the expanded one**

Replace the component with:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AiJobStatus, AiJobSummary } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCourseAiJob, useCourseAiJobs } from '@/lib/queries';
import { JobActivityTimeline } from './JobActivityTimeline';

type Props = { courseId: string };

function statusVariant(status: AiJobStatus): 'success' | 'destructive' | 'info' | 'secondary' | 'outline' {
  switch (status) {
    case 'succeeded': return 'success';
    case 'failed': return 'destructive';
    case 'partial': return 'outline';
    case 'running':
    case 'queued': return 'info';
    case 'canceled':
    default: return 'secondary';
  }
}

function formatCost(cents: number | null): string {
  if (cents == null || cents <= 0) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatWhen(j: AiJobSummary): string {
  const ts = j.finishedAt ?? j.startedAt ?? j.createdAt;
  return new Date(ts).toLocaleString();
}

function JobRow({ courseId, j }: { courseId: string; j: AiJobSummary }): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(j.status === 'running' || j.status === 'queued');
  const detailQ = useCourseAiJob(courseId, open ? j.id : null);

  return (
    <li className="rounded border bg-background">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Badge variant={statusVariant(j.status)}>{t(`ai.jobStatus.${j.status}`)}</Badge>
            <span className="truncate text-sm font-medium">{j.modelDisplayName}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {t('ai.history.progress', {
              succeeded: j.succeededCount,
              failed: j.failedCount,
              total: j.artifactCount,
            })}{' '}
            · {formatWhen(j)}
            {j.costCents != null && j.costCents > 0 ? ` · ${formatCost(j.costCents)}` : ''}
          </div>
        </div>
      </button>
      {open ? (
        <div className="px-3 pb-3">
          <JobActivityTimeline status={j.status} events={detailQ.data?.events ?? []} />
        </div>
      ) : null}
    </li>
  );
}

export function GenerationHistoryCard({ courseId }: Props): JSX.Element | null {
  const { t } = useTranslation();
  const jobsQ = useCourseAiJobs(courseId);
  const jobs = jobsQ.data ?? [];

  if (jobsQ.isLoading && jobs.length === 0) return null;
  if (!jobsQ.isLoading && jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('ai.history.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {jobs.map((j) => (
            <JobRow key={j.id} courseId={courseId} j={j} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Typecheck + lint**

```bash
cd apps/web && pnpm typecheck
```
Expected: 0 errors.

**Step 3: Manual browser smoke test**

Start dev:

```bash
cd /Users/zhijiangchen/CourseWise && pnpm dev
```

In a teacher account, open a course overview page, kick off an AI generation, and watch the history card.

Verify:
- The row auto-expands while running and shows the Activity timeline.
- New events appear roughly every 2 seconds.
- Auto-scroll follows the latest event; scrolling up pauses it.
- The "Show realtime output" checkbox hides/shows the timeline; reload — the user's last choice persists via `localStorage`.
- After finish, the row stays expanded; toggling off + reload keeps it off.
- An error in the workflow (e.g. with `AI_GATEWAY_TOKEN` deliberately wrong) produces a red-dot `artifact.failed` event with the gateway-401 message.

**Step 4: Commit**

```bash
git add apps/web/src/components/ai/GenerationHistoryCard.tsx
git commit -m "feat(ai): expandable history rows with Activity timeline"
```

---

## Task 10 — Push the branch & open the PR

**Files:** _(none)_

**Step 1: Push the branch**

```bash
git push -u origin realtime-agent-output-design
```

**Step 2: Open PR**

```bash
gh pr create --title "Realtime agent output for AI generation jobs" --body "$(cat <<'EOF'
## Summary
- Add `ai_generation_events` table + Drizzle schema (`apps/api`).
- Emit step-by-step progress events from the job-creation route and the `MaterialGenerationWorkflow` at seven natural boundaries (job.started, context.loaded, artifact.calling_model, artifact.model_responded / artifact.failed, artifact.saved, job.finished).
- Extend `GET /api/courses/:id/ai/jobs/:jobId` with `events: AiJobEvent[]`.
- Add an expandable `JobActivityTimeline` to the existing `GenerationHistoryCard` — clicking a job row reveals a live, auto-scrolling timeline; a "Show realtime output" toggle is persisted to `localStorage`.

Design doc: `docs/plans/2026-05-18-realtime-agent-output-design.md`

## Test plan
- [ ] `pnpm --filter @coursewise/api test` passes.
- [ ] `pnpm --filter @coursewise/api typecheck` passes.
- [ ] `pnpm --filter coursewise-web typecheck` passes.
- [ ] Run a real generation locally: events appear in `ai_generation_events` in the correct order (job.started → context.loaded → artifact.calling_model → artifact.model_responded → artifact.saved → job.finished).
- [ ] Force a failure (bad `AI_GATEWAY_TOKEN`): see a red `artifact.failed` event with the gateway error.
- [ ] Browser UI: timeline auto-scrolls while running, the toggle persists across reload, history rows expand/collapse.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope (intentionally)

- Streaming Anthropic SSE tokens to the browser. We chose step-events instead during brainstorming.
- A dedicated job-detail route/page. Inline expansion in the history card is sufficient.
- Cursor-paginated `?after=<eventId>` event endpoint. Jobs are short-lived; whole-array on each poll is fine.
- Server-side cleanup of old events. Events live as long as the job (cascade on delete) — fine.

## Notes for the implementer

- **DRY:** the seven event-emission boundaries all share the same `recordEvent` helper. Don't inline `db.insert(aiGenerationEvents)` anywhere else.
- **Don't wrap `recordEvent` in `step.do(...)`.** Cloudflare Workflow steps are durable and treat any throw as a step failure — but we want event failures to be silent. The helper's own try/catch covers that; keep the calls outside of any `step.do` boundary by placing them inside the existing step callbacks rather than as their own steps.
- **Frequent commits:** there's one commit per task above. Don't squash.
- **No new tests beyond `events.test.ts`.** The workflow runtime needs the Workers runtime to exercise; manual smoke (Step 6 of Task 6) is the verification.
