# Gamma Presentations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task.

**Goal:** Add a "Generate with Gamma" flow on the teacher presentations page that lets a teacher pick reading materials, give freeform instructions, choose a Gamma theme + image style, and end up with a presentation row in CourseWise that links to the Gamma deck and ships a downloadable `.pptx`.

**Architecture:** A new `gamma_generation_jobs` table tracks the async lifecycle. Three extra columns on `presentations` (`external_url`, `provider`, `file_asset_id`) carry the Gamma deck reference and the cached `.pptx`. A small `services/gamma/` module wraps Gamma's REST API and the `pollAndFinalize` step that streams the `.pptx` into R2 via the `COURSE_FILES` binding. Three new Hono routes (theme proxy, generate, job status) drive the UI. The browser polls our `/api/gamma-jobs/{id}` endpoint every 5 s; we throttle calls to Gamma to ≥ 4 s per job so multiple polling tabs don't multiply upstream traffic. No Cloudflare Workflows — Gamma owns the long-running job.

**Tech Stack:** Drizzle (Postgres), Hono on Cloudflare Workers, R2 binding (`COURSE_FILES`), KV (`RATE_LIMIT_KV`), Zod, React + TanStack Query + react-i18next, Vitest.

**Design reference:** [docs/plans/2026-05-19-gamma-presentations-design.md](./2026-05-19-gamma-presentations-design.md)

---

## Task 1 — Schema migration + drizzle types

**Why first:** Every later task depends on the table + column names.

**Files:**
- Create: `apps/api/drizzle/0010_gamma_presentations.sql`
- Modify: `apps/api/src/db/schema.ts` — add columns to `presentations`, add `gammaGenerationJobs` table, export the enums.
- Modify: `apps/api/src/types.ts` — add `GAMMA_API_KEY?: string` to `AppBindings`.
- Modify: `apps/api/wrangler.toml` — document the `GAMMA_API_KEY` secret in the comment block.
- Modify: `apps/api/.dev.vars.example` — add a `GAMMA_API_KEY=` placeholder.

**Step 1: Write the migration**

```sql
-- 0010_gamma_presentations.sql
ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "external_url" text;
ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "provider" text;
ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "file_asset_id" uuid;

DO $$ BEGIN
  ALTER TABLE "presentations"
    ADD CONSTRAINT "presentations_file_asset_id_fkey"
    FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "gamma_job_status" AS ENUM ('pending', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gamma_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "presentation_id" uuid,
  "requested_by_id" uuid,
  "status" "gamma_job_status" NOT NULL DEFAULT 'pending',
  "gamma_generation_id" text,
  "gamma_url" text,
  "export_url" text,
  "error_message" text,
  "material_ids" uuid[] NOT NULL,
  "request_params" jsonb NOT NULL,
  "credits_deducted" integer,
  "credits_remaining" integer,
  "last_polled_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "gamma_generation_jobs"
    ADD CONSTRAINT "gamma_generation_jobs_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "gamma_generation_jobs"
    ADD CONSTRAINT "gamma_generation_jobs_presentation_id_fkey"
    FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "gamma_generation_jobs"
    ADD CONSTRAINT "gamma_generation_jobs_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "gamma_generation_jobs_course_idx"
  ON "gamma_generation_jobs" ("course_id");
CREATE INDEX IF NOT EXISTS "gamma_generation_jobs_status_idx"
  ON "gamma_generation_jobs" ("status");
CREATE INDEX IF NOT EXISTS "gamma_generation_jobs_presentation_idx"
  ON "gamma_generation_jobs" ("presentation_id");
```

**Step 2: Update `apps/api/src/db/schema.ts`**

Find the `presentations` table definition and add the three columns:

```ts
externalUrl: text('external_url'),
provider: text('provider'),
fileAssetId: uuid('file_asset_id').references(() => fileAssets.id, { onDelete: 'set null' }),
```

After `slides`, append the new enum + table:

```ts
export const gammaJobStatusEnum = pgEnum('gamma_job_status', [
  'pending',
  'completed',
  'failed',
]);

export const gammaGenerationJobs = pgTable(
  'gamma_generation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    presentationId: uuid('presentation_id').references(() => presentations.id, {
      onDelete: 'set null',
    }),
    requestedById: uuid('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    status: gammaJobStatusEnum('status').notNull().default('pending'),
    gammaGenerationId: text('gamma_generation_id'),
    gammaUrl: text('gamma_url'),
    exportUrl: text('export_url'),
    errorMessage: text('error_message'),
    materialIds: uuid('material_ids').array().notNull(),
    requestParams: jsonb('request_params').notNull(),
    creditsDeducted: integer('credits_deducted'),
    creditsRemaining: integer('credits_remaining'),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('gamma_generation_jobs_course_idx').on(t.courseId),
    statusIdx: index('gamma_generation_jobs_status_idx').on(t.status),
    presentationIdx: index('gamma_generation_jobs_presentation_idx').on(t.presentationId),
  }),
);
```

Add `jsonb` and `integer` to the existing `drizzle-orm/pg-core` import if they aren't already imported.

**Step 3: Update `apps/api/src/types.ts`**

```ts
GAMMA_API_KEY?: string;
```

**Step 4: Update `apps/api/wrangler.toml` comment block**

Add to the production-secrets comment block:

```toml
#   GAMMA_API_KEY        — Gamma Generate API key (https://developers.gamma.app),
#                          enables POST /api/courses/{id}/presentations/gamma
```

**Step 5: Update `apps/api/.dev.vars.example`**

Append:

```
# Gamma Generate API key. Optional — gamma routes return 500 with a clear error
# until this is set. Create one at https://gamma.app/account-settings/api-keys
GAMMA_API_KEY=
```

**Step 6: Generate and verify**

Run `pnpm --filter @coursewise/api db:generate -- --strict` to confirm drizzle's snapshot matches the SQL we hand-wrote (if it produces a diff, reconcile by hand). Run the typecheck.

```sh
pnpm --filter @coursewise/api typecheck
```

Expected: clean. The new `gammaGenerationJobs` symbol should be importable.

**Step 7: Commit**

```sh
git add apps/api/drizzle/0010_gamma_presentations.sql apps/api/src/db/schema.ts apps/api/src/types.ts apps/api/wrangler.toml apps/api/.dev.vars.example
git commit -m "gamma: schema migration + drizzle types"
```

---

## Task 2 — Shared zod schemas + TS types

**Why before the service:** the service module and the routes both import these.

**Files:**
- Modify: `packages/shared/src/constants.ts` — add Gamma enums.
- Modify: `packages/shared/src/validators.ts` — add the request schema.
- Modify: `packages/shared/src/types.ts` — add response/row types.
- Modify: `packages/shared/src/index.ts` — re-export anything new (probably already barrel-style).

**Step 1: Add the constants**

```ts
// packages/shared/src/constants.ts
export const GAMMA_IMAGE_SOURCES = [
  'aiGenerated',
  'webFreeToUse',
  'webFreeToUseCommercially',
  'pictographic',
  'themeAccent',
  'noImages',
] as const;
export type GammaImageSource = (typeof GAMMA_IMAGE_SOURCES)[number];

export const GAMMA_TEXT_AMOUNTS = ['brief', 'medium', 'detailed', 'extensive'] as const;
export type GammaTextAmount = (typeof GAMMA_TEXT_AMOUNTS)[number];

export const GAMMA_JOB_STATUSES = ['pending', 'completed', 'failed'] as const;
export type GammaJobStatus = (typeof GAMMA_JOB_STATUSES)[number];

export const GAMMA_EXPORT_FORMATS = ['pptx', 'pdf'] as const;
export type GammaExportFormat = (typeof GAMMA_EXPORT_FORMATS)[number];

// Soft caps that mirror Gamma's hard limits; we keep ours lower so we can grow.
export const GAMMA_MAX_INPUT_TEXT_CHARS = 380_000; // Gamma's hard cap is 400_000.
export const GAMMA_MAX_INSTRUCTIONS_CHARS = 5_000;
export const GAMMA_MAX_IMAGE_STYLE_CHARS = 500;
```

**Step 2: Add the request schema**

```ts
// packages/shared/src/validators.ts
import {
  GAMMA_EXPORT_FORMATS,
  GAMMA_IMAGE_SOURCES,
  GAMMA_MAX_IMAGE_STYLE_CHARS,
  GAMMA_MAX_INSTRUCTIONS_CHARS,
  GAMMA_TEXT_AMOUNTS,
} from './constants';

export const generateGammaPresentationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  moduleId: z.string().uuid().optional().nullable(),
  materialIds: z.array(z.string().uuid()).min(1).max(50),
  additionalInstructions: z
    .string()
    .trim()
    .max(GAMMA_MAX_INSTRUCTIONS_CHARS)
    .optional()
    .nullable(),
  themeId: z.string().trim().max(120).optional().nullable(),
  imageSource: z.enum(GAMMA_IMAGE_SOURCES).default('aiGenerated'),
  imageStyle: z.string().trim().max(GAMMA_MAX_IMAGE_STYLE_CHARS).optional().nullable(),
  amount: z.enum(GAMMA_TEXT_AMOUNTS).default('medium'),
  exportAs: z.enum(GAMMA_EXPORT_FORMATS).default('pptx'),
});
export type GenerateGammaPresentationInput = z.infer<typeof generateGammaPresentationSchema>;
```

**Step 3: Add the response types**

```ts
// packages/shared/src/types.ts
export interface GammaTheme {
  id: string;
  name: string;
  previewUrl?: string | null;
}

export interface GammaGenerationJob {
  id: string;
  courseId: string;
  presentationId: string | null;
  status: GammaJobStatus;
  gammaUrl: string | null;
  exportUrl: string | null;
  errorMessage: string | null;
  creditsDeducted: number | null;
  creditsRemaining: number | null;
  materialIds: string[];
  requestParams: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateGammaPresentationResponse {
  presentationId: string;
  jobId: string;
}
```

**Step 4: Typecheck + commit**

```sh
pnpm -r typecheck
git add packages/shared/src
git commit -m "gamma: shared types + request validator"
```

---

## Task 3 — `services/gamma/` module + unit tests

**Why before the routes:** the routes are thin wrappers around this.

**Files:**
- Create: `apps/api/src/services/gamma/client.ts`
- Create: `apps/api/src/services/gamma/buildInputText.ts`
- Create: `apps/api/src/services/gamma/poll.ts`
- Create: `apps/api/src/services/gamma/client.test.ts`
- Create: `apps/api/src/services/gamma/buildInputText.test.ts`
- Create: `apps/api/src/services/gamma/poll.test.ts`

**Step 1: Client (`client.ts`)**

```ts
import type {
  GammaExportFormat,
  GammaImageSource,
  GammaTextAmount,
  GammaTheme,
} from '@coursewise/shared';
import { ApiException, ERROR_CODES } from '../../lib/errors';

const BASE_URL = 'https://public-api.gamma.app/v1.0';

export interface GammaCreateGenerationInput {
  inputText: string;
  format: 'presentation';
  exportAs: GammaExportFormat;
  title?: string;
  themeId?: string | null;
  additionalInstructions?: string | null;
  textOptions?: { amount?: GammaTextAmount };
  imageOptions?: { source?: GammaImageSource; style?: string | null };
}

export interface GammaCreateGenerationResponse {
  generationId: string;
  warnings?: string | null;
}

export type GammaGetGenerationResponse =
  | {
      generationId: string;
      status: 'pending';
    }
  | {
      generationId: string;
      status: 'completed';
      gammaUrl: string;
      exportUrl: string;
      gammaId?: string;
      credits?: { deducted?: number; remaining?: number };
    }
  | {
      generationId: string;
      status: 'failed';
      error?: { message?: string; statusCode?: number };
    };

export class GammaClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('GammaClient: apiKey is required');
  }

  async createGeneration(
    input: GammaCreateGenerationInput,
  ): Promise<GammaCreateGenerationResponse> {
    return this.request<GammaCreateGenerationResponse>('POST', '/generations', input);
  }

  async getGeneration(generationId: string): Promise<GammaGetGenerationResponse> {
    return this.request<GammaGetGenerationResponse>('GET', `/generations/${generationId}`);
  }

  async listThemes(): Promise<GammaTheme[]> {
    const raw = await this.request<{ themes?: unknown[] } | unknown[]>('GET', '/themes');
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw.themes) ? raw.themes : [];
    return arr
      .map((t) => {
        const o = t as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id : null;
        const name = typeof o.name === 'string' ? o.name : id;
        if (!id || !name) return null;
        return {
          id,
          name,
          previewUrl: typeof o.previewUrl === 'string' ? o.previewUrl : null,
        } satisfies GammaTheme;
      })
      .filter((t): t is GammaTheme => t !== null);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'X-API-KEY': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      // Surface Gamma's error verbatim to the caller; map credit/key errors to
      // user-actionable messages.
      const code = res.status === 402
        ? ERROR_CODES.CONFLICT
        : res.status === 401 || res.status === 403
          ? ERROR_CODES.FORBIDDEN
          : ERROR_CODES.INTERNAL_ERROR;
      throw new ApiException(
        res.status === 401 || res.status === 402 || res.status === 403 ? res.status : 502,
        code,
        `Gamma API ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
```

**Step 2: `buildInputText.ts`**

```ts
import { GAMMA_MAX_INPUT_TEXT_CHARS } from '@coursewise/shared';

export interface MaterialForGamma {
  id: string;
  title: string;
  description: string | null;
  sourceType: 'upload' | 'external_link' | 'manual_text';
  content: string | null;
}

/**
 * Stitch a list of reading materials into one inputText string for Gamma:
 *   manual_text  → "{title}\n\n{content}"
 *   upload       → "[Slide source: {title} — {description ?? 'attached file'}]"
 *   external_link→ "[Slide source: {title} — {description ?? 'see link'}]"
 *
 * Sections are joined with "\n\n---\n\n". Result is hard-capped to
 * GAMMA_MAX_INPUT_TEXT_CHARS so we stay below Gamma's 400 000 cap.
 */
export function buildInputText(materials: MaterialForGamma[]): string {
  const parts = materials.map((m) => {
    if (m.sourceType === 'manual_text') {
      const body = (m.content ?? '').trim();
      return body ? `${m.title}\n\n${body}` : m.title;
    }
    const note = m.description?.trim() ?? (m.sourceType === 'upload' ? 'attached file' : 'see link');
    return `[Slide source: ${m.title} — ${note}]`;
  });
  const joined = parts.filter(Boolean).join('\n\n---\n\n');
  return joined.length <= GAMMA_MAX_INPUT_TEXT_CHARS
    ? joined
    : joined.slice(0, GAMMA_MAX_INPUT_TEXT_CHARS);
}
```

**Step 3: `poll.ts`**

```ts
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { fileAssets, gammaGenerationJobs, presentations } from '../../db/schema';
import { ApiException, ERROR_CODES } from '../../lib/errors';
import type { GammaClient, GammaGetGenerationResponse } from './client';

const MIN_POLL_GAP_MS = 4_000;

export interface PollDeps {
  db: Db;
  client: GammaClient;
  r2: R2Bucket | undefined;
  bucketName: string;
  now?: () => Date;
  fetchExport?: typeof fetch; // injectable for tests
}

/**
 * If the job is still `pending`, hit Gamma once (throttled). When Gamma says
 * `completed`, stream the .pptx into R2 and update the presentation row.
 * Always returns the up-to-date job row.
 */
export async function pollAndFinalize(jobId: string, deps: PollDeps) {
  const { db, client, r2, bucketName, fetchExport = fetch } = deps;
  const now = (deps.now ?? (() => new Date()))();

  const [job] = await db
    .select()
    .from(gammaGenerationJobs)
    .where(eq(gammaGenerationJobs.id, jobId))
    .limit(1);
  if (!job) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Gamma job not found');
  if (job.status !== 'pending' || !job.gammaGenerationId) return job;

  // Per-job rate limit: ≥ MIN_POLL_GAP_MS between Gamma calls.
  if (job.lastPolledAt) {
    const gap = now.getTime() - new Date(job.lastPolledAt).getTime();
    if (gap < MIN_POLL_GAP_MS) return job;
  }

  let resp: GammaGetGenerationResponse;
  try {
    resp = await client.getGeneration(job.gammaGenerationId);
  } catch (err) {
    // Don't fail the job on a transient upstream error — record the time and
    // let the next poll retry.
    await db
      .update(gammaGenerationJobs)
      .set({ lastPolledAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(gammaGenerationJobs.id, jobId));
    throw err;
  }

  if (resp.status === 'pending') {
    const [updated] = await db
      .update(gammaGenerationJobs)
      .set({ lastPolledAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(gammaGenerationJobs.id, jobId))
      .returning();
    return updated ?? job;
  }

  if (resp.status === 'failed') {
    const [updated] = await db
      .update(gammaGenerationJobs)
      .set({
        status: 'failed',
        errorMessage: resp.error?.message ?? 'Gamma reported the generation failed',
        lastPolledAt: now.toISOString(),
        completedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .where(eq(gammaGenerationJobs.id, jobId))
      .returning();
    return updated ?? job;
  }

  // status === 'completed' — stream the .pptx into R2 (best-effort) and stamp
  // the presentation row.
  let fileAssetId: string | null = null;
  if (r2 && job.presentationId && job.requestedById) {
    try {
      const headRes = await fetchExport(resp.exportUrl, { method: 'GET' });
      if (!headRes.ok || !headRes.body) throw new Error(`exportUrl ${headRes.status}`);
      const r2Key = `courses/${job.courseId}/gamma/${job.id}/${job.id}.pptx`;
      await r2.put(r2Key, headRes.body, {
        httpMetadata: {
          contentType:
            headRes.headers.get('content-type')
              ?? 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      });
      const sizeHeader = headRes.headers.get('content-length');
      const size = sizeHeader ? Number.parseInt(sizeHeader, 10) : 0;
      const [asset] = await db
        .insert(fileAssets)
        .values({
          ownerId: job.requestedById,
          courseId: job.courseId,
          bucket: bucketName,
          objectKey: r2Key,
          contentType:
            headRes.headers.get('content-type')
              ?? 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
          originalFilename: `${job.id}.pptx`,
          status: 'ready',
          relatedType: 'material',
        })
        .returning();
      fileAssetId = asset?.id ?? null;
    } catch (err) {
      console.error('gamma: failed to mirror .pptx into R2', { jobId, err });
      fileAssetId = null;
    }
  }

  if (job.presentationId) {
    await db
      .update(presentations)
      .set({
        externalUrl: resp.gammaUrl,
        provider: 'gamma',
        fileAssetId,
        updatedAt: now.toISOString(),
      })
      .where(eq(presentations.id, job.presentationId));
  }

  const [updated] = await db
    .update(gammaGenerationJobs)
    .set({
      status: 'completed',
      gammaUrl: resp.gammaUrl,
      exportUrl: resp.exportUrl,
      creditsDeducted: resp.credits?.deducted ?? null,
      creditsRemaining: resp.credits?.remaining ?? null,
      lastPolledAt: now.toISOString(),
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .where(eq(gammaGenerationJobs.id, jobId))
    .returning();
  return updated ?? job;
}
```

**Step 4: Write the failing tests first**

`buildInputText.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildInputText } from './buildInputText';

describe('buildInputText', () => {
  it('uses content for manual_text and a stub for non-manual', () => {
    const out = buildInputText([
      { id: 'a', title: 'Chapter 1', description: null, sourceType: 'manual_text', content: 'hello world' },
      { id: 'b', title: 'Notes.pdf', description: 'syllabus', sourceType: 'upload', content: null },
      { id: 'c', title: 'External', description: null, sourceType: 'external_link', content: null },
    ]);
    expect(out).toContain('Chapter 1\n\nhello world');
    expect(out).toContain('[Slide source: Notes.pdf — syllabus]');
    expect(out).toContain('[Slide source: External — see link]');
    expect(out.split('\n\n---\n\n').length).toBe(3);
  });

  it('truncates beyond 380_000 characters', () => {
    const big = 'x'.repeat(400_000);
    const out = buildInputText([
      { id: 'a', title: 't', description: null, sourceType: 'manual_text', content: big },
    ]);
    expect(out.length).toBe(380_000);
  });
});
```

`client.test.ts` — happy path + 401 handling using a `vi.stubGlobal('fetch', …)` mock.

`poll.test.ts` — for the three branches (still pending → throttled, failed, completed → updates presentation + writes to R2 mock). Use a thin R2Bucket mock with a `put` method that records the key. Use injected `fetchExport` so we don't really hit Gamma's export URL.

**Step 5: Run tests**

```sh
pnpm --filter @coursewise/api test -- gamma/
```

Expected: all green.

**Step 6: Commit**

```sh
git add apps/api/src/services/gamma
git commit -m "gamma: client + buildInputText + pollAndFinalize"
```

---

## Task 4 — Worker routes + OpenAPI + permissions test

**Files:**
- Create: `apps/api/src/routes/gammaPresentations.ts`
- Modify: `apps/api/src/index.ts` — mount the new routes.
- Modify: `apps/api/src/lib/openapi.ts` — three new rows in `ROUTES` and a tag description.
- Create: `apps/api/src/routes/gamma.permissions.test.ts`

**Step 1: Route file skeleton**

```ts
// apps/api/src/routes/gammaPresentations.ts
import { Hono } from 'hono';
import { and, desc, eq, inArray } from 'drizzle-orm';
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
import { canWriteCourse } from '../services/courseAccess';
import { recordAudit } from '../services/audit';
import {
  GammaClient,
  buildInputText,
  pollAndFinalize,
  type MaterialForGamma,
} from '../services/gamma';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

const THEME_CACHE_KEY = 'gamma:themes:v1';
const THEME_CACHE_TTL = 60 * 60; // 1 h

function clientOr500(apiKey: string | undefined): GammaClient {
  if (!apiKey) {
    throw new ApiException(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'GAMMA_API_KEY is not configured on this Worker',
    );
  }
  return new GammaClient(apiKey);
}

r.get('/gamma/themes', requireScopeGroup('presentationsRead'), async (c) => {
  const kv = c.env.RATE_LIMIT_KV;
  if (kv) {
    const cached = await kv.get(THEME_CACHE_KEY, 'json');
    if (cached) return success(c, cached as GammaTheme[]);
  }
  const themes = await clientOr500(c.env.GAMMA_API_KEY).listThemes();
  if (kv) {
    await kv.put(THEME_CACHE_KEY, JSON.stringify(themes), { expirationTtl: THEME_CACHE_TTL });
  }
  return success(c, themes);
});

r.post(
  '/courses/:courseId/presentations/gamma',
  requireScopeGroup('presentationsWrite'),
  validateJson(generateGammaPresentationSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const input = c.get('validated') as GenerateGammaPresentationInput;

    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }

    // Fetch + authorize the materials in one shot.
    const materials = (await db
      .select({
        id: readingMaterials.id,
        title: readingMaterials.title,
        description: readingMaterials.description,
        sourceType: readingMaterials.sourceType,
        content: readingMaterials.content,
        courseId: readingMaterials.courseId,
      })
      .from(readingMaterials)
      .where(inArray(readingMaterials.id, input.materialIds))) as Array<MaterialForGamma & {
      courseId: string;
    }>;
    if (materials.length !== input.materialIds.length) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'One or more materials not found');
    }
    if (materials.some((m) => m.courseId !== courseId)) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Material does not belong to this course');
    }

    const inputText = buildInputText(materials);
    if (!inputText) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Selected materials produced empty inputText');
    }

    const gamma = clientOr500(c.env.GAMMA_API_KEY);
    const created = await gamma.createGeneration({
      inputText,
      format: 'presentation',
      title: input.title,
      themeId: input.themeId ?? undefined,
      additionalInstructions: input.additionalInstructions ?? undefined,
      textOptions: { amount: input.amount },
      imageOptions: { source: input.imageSource, style: input.imageStyle ?? undefined },
      exportAs: input.exportAs,
    });

    const [presentation] = await db
      .insert(presentations)
      .values({
        courseId,
        moduleId: input.moduleId ?? null,
        title: input.title,
        description: null,
        status: 'draft',
        provider: 'gamma',
        createdById: auth.user.id,
      })
      .returning();
    if (!presentation) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to insert presentation');
    }

    const [job] = await db
      .insert(gammaGenerationJobs)
      .values({
        courseId,
        presentationId: presentation.id,
        requestedById: auth.user.id,
        status: 'pending',
        gammaGenerationId: created.generationId,
        materialIds: input.materialIds,
        requestParams: { ...input, inputTextChars: inputText.length },
      })
      .returning();
    if (!job) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to insert gamma job');
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'gamma.generation.start',
      target: job.id,
      metadata: { courseId, presentationId: presentation.id, materialCount: materials.length },
    });

    const body: CreateGammaPresentationResponse = {
      presentationId: presentation.id,
      jobId: job.id,
    };
    return success(c, body, 201);
  },
);

r.get('/gamma-jobs/:jobId', requireScopeGroup('presentationsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const jobId = requireParam(c, 'jobId');

  // Authorize by course write access (same gate as the create route).
  const [job] = await db
    .select()
    .from(gammaGenerationJobs)
    .where(eq(gammaGenerationJobs.id, jobId))
    .limit(1);
  if (!job) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Gamma job not found');
  if (!(await canWriteCourse(db, auth.user, job.courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
  }

  const updated = await pollAndFinalize(jobId, {
    db,
    client: clientOr500(c.env.GAMMA_API_KEY),
    r2: c.env.COURSE_FILES,
    bucketName: c.env.R2_BUCKET ?? 'coursewise-files',
  });

  const summary: GammaGenerationJob = {
    id: updated.id,
    courseId: updated.courseId,
    presentationId: updated.presentationId,
    status: updated.status,
    gammaUrl: updated.gammaUrl,
    exportUrl: updated.exportUrl,
    errorMessage: updated.errorMessage,
    creditsDeducted: updated.creditsDeducted,
    creditsRemaining: updated.creditsRemaining,
    materialIds: updated.materialIds,
    requestParams: updated.requestParams as Record<string, unknown>,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    completedAt: updated.completedAt,
  };
  return success(c, summary);
});

export default r;
```

**Step 2: Re-export from the service barrel**

Add `apps/api/src/services/gamma/index.ts`:

```ts
export * from './client';
export * from './buildInputText';
export * from './poll';
```

**Step 3: Mount the routes**

In `apps/api/src/index.ts`, after the other `app.route('/api', …)` lines:

```ts
import gammaRoutes from './routes/gammaPresentations';
// …
app.route('/api', gammaRoutes);
```

**Step 4: OpenAPI**

In `apps/api/src/lib/openapi.ts`, add three rows alongside the existing presentations entries:

```ts
r('get', '/api/gamma/themes', 'List Gamma themes (1h KV-cached)', 'gamma', {
  scopeGroup: 'presentationsRead',
}),
r(
  'post',
  '/api/courses/{courseId}/presentations/gamma',
  'Start a Gamma generation from selected reading materials',
  'gamma',
  { scopeGroup: 'presentationsWrite', pathParams: idParams('courseId') },
),
r('get', '/api/gamma-jobs/{jobId}', 'Poll the status of a Gamma generation job', 'gamma', {
  scopeGroup: 'presentationsRead',
  pathParams: idParams('jobId'),
}),
```

Add the tag description:

```ts
gamma: 'Gamma-generated presentations (external rendering via gamma.app).',
```

**Step 5: Permissions test**

```ts
// apps/api/src/routes/gamma.permissions.test.ts
import { describe, expect, it } from 'vitest';
import app from '../index';
import type { Env } from '../index';

const env: Env = {
  // …same shape as the other permissions tests…
  R2_BUCKET: 'coursewise-files',
  R2_ACCOUNT_ID: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
};

describe('gamma routes — unauthenticated rejections', () => {
  it('GET /api/gamma/themes → 401', async () => {
    const res = await app.request('/api/gamma/themes', {}, env);
    expect(res.status).toBe(401);
  });
  it('POST /api/courses/<uuid>/presentations/gamma → 401', async () => {
    const res = await app.request(
      '/api/courses/11111111-1111-1111-1111-111111111111/presentations/gamma',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      env,
    );
    expect(res.status).toBe(401);
  });
  it('GET /api/gamma-jobs/<uuid> → 401', async () => {
    const res = await app.request(
      '/api/gamma-jobs/11111111-1111-1111-1111-111111111111',
      {},
      env,
    );
    expect(res.status).toBe(401);
  });
});
```

**Step 6: Verify**

```sh
pnpm --filter @coursewise/api typecheck
pnpm --filter @coursewise/api test
pnpm lint
```

Expected: all green. `auth-coverage.test.ts` should automatically include the three new routes (because they all use `requireAuth`).

**Step 7: Commit**

```sh
git add apps/api/src
git commit -m "gamma: theme proxy + generate + job-status routes"
```

---

## Task 5 — Web Query hooks + dialog

**Files:**
- Modify: `apps/web/src/lib/queries.ts` — `useGammaThemes`, `useCreateGammaPresentation`, `useGammaJob`.
- Create: `apps/web/src/components/gamma/GenerateGammaDialog.tsx`
- Modify: `apps/web/src/locales/en.ts` and `apps/web/src/locales/zh-CN.ts` — add the new keys.

**Step 1: Query hooks**

```ts
// in apps/web/src/lib/queries.ts (next to the existing presentation hooks)

export function useGammaThemes() {
  return useQuery({
    queryKey: ['gamma', 'themes'],
    queryFn: () => apiCall<GammaTheme[]>('/api/gamma/themes'),
    staleTime: 60 * 60 * 1000,
  });
}

export function useCreateGammaPresentation(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateGammaPresentationInput) =>
      apiCall<CreateGammaPresentationResponse>(
        `/api/courses/${courseId}/presentations/gamma`,
        { body: input },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presentations', courseId] }),
  });
}

export function useGammaJob(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['gamma', 'job', jobId],
    enabled: !!jobId && enabled,
    queryFn: () => apiCall<GammaGenerationJob>(`/api/gamma-jobs/${jobId}`),
    refetchInterval: (q) =>
      q.state.data?.status === 'pending' ? 5_000 : false,
  });
}
```

Also import the new types from `@coursewise/shared`.

**Step 2: Dialog component**

```tsx
// apps/web/src/components/gamma/GenerateGammaDialog.tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GAMMA_IMAGE_SOURCES,
  GAMMA_TEXT_AMOUNTS,
  type GammaImageSource,
  type GammaTextAmount,
  type GenerateGammaPresentationInput,
  type MaterialSummary,
  type ModuleSummary,
} from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import {
  useCreateGammaPresentation,
  useGammaThemes,
  useMaterialsList,
  useModulesList,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export function GenerateGammaDialog({
  open,
  onClose,
  courseId,
  defaultModuleId,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  defaultModuleId?: string | null;
  onStarted: (jobId: string, presentationId: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const themes = useGammaThemes();
  const modulesQ = useModulesList(courseId);
  const materialsQ = useMaterialsList(courseId);
  const create = useCreateGammaPresentation(courseId);
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [moduleId, setModuleId] = useState<string | null>(defaultModuleId ?? null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [instructions, setInstructions] = useState('');
  const [themeId, setThemeId] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<GammaImageSource>('aiGenerated');
  const [imageStyle, setImageStyle] = useState('');
  const [amount, setAmount] = useState<GammaTextAmount>('medium');

  // Pre-check every manual_text material the first time the list arrives.
  const materials = materialsQ.data ?? [];
  const preselected = useMemo(
    () => materials.filter((m) => m.sourceType === 'manual_text' && m.status !== 'draft').map((m) => m.id),
    [materials],
  );
  if (open && preselected.length > 0 && selected.size === 0) {
    setSelected(new Set(preselected));
  }

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (!title.trim() || selected.size === 0) return;
    const input: GenerateGammaPresentationInput = {
      title: title.trim(),
      moduleId: moduleId ?? null,
      materialIds: Array.from(selected),
      additionalInstructions: instructions.trim() || null,
      themeId,
      imageSource,
      imageStyle: imageStyle.trim() || null,
      amount,
      exportAs: 'pptx',
    };
    try {
      const res = await create.mutateAsync(input);
      toast.push({ title: t('gamma.generationStarted'), tone: 'success' });
      onStarted(res.jobId, res.presentationId);
      onClose();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('gamma.dialogTitle')} size="lg" closeOnBackdrop={false}>
      <form className="space-y-4" onSubmit={onSubmit}>
        {/* …fields…  Use the existing Dialog primitive's layout patterns. */}
      </form>
    </Dialog>
  );
}
```

Build out the form fields: title, module dropdown, material multi-select (grouped by module title), instructions textarea, theme select, image-source select, image-style input, amount select. Reuse the same UI primitives the other dialogs use (`Input`, `Label`, `Textarea`, `Select`). Mirror the spacing and validation patterns from `TeacherMaterialEditPage` so the dialog feels native.

**Step 3: i18n strings**

```ts
// apps/web/src/locales/en.ts (find the appropriate section)
gamma: {
  dialogTitle: 'Generate presentation with Gamma',
  generateButton: 'Generate with Gamma',
  fields: {
    title: 'Title',
    module: 'Module',
    materials: 'Reading materials',
    materialsHint: 'Pick the materials Gamma should use as source content.',
    instructions: 'Additional instructions',
    instructionsHint: 'Optional. Example: "Open with the agenda, end with discussion questions."',
    theme: 'Theme',
    imageSource: 'Image source',
    imageStyle: 'Image style',
    imageStyleHint: 'Optional. Example: "Photorealistic, soft natural light".',
    amount: 'Detail length',
  },
  imageSource: {
    aiGenerated: 'AI generated',
    webFreeToUse: 'Web (free to use)',
    webFreeToUseCommercially: 'Web (free for commercial use)',
    pictographic: 'Pictographic',
    themeAccent: 'Theme accent',
    noImages: 'No images',
  },
  amount: {
    brief: 'Brief',
    medium: 'Medium',
    detailed: 'Detailed',
    extensive: 'Extensive',
  },
  generationStarted: 'Generation started — Gamma is rendering your deck',
  generating: 'Generating with Gamma…',
  openInGamma: 'Open in Gamma',
  downloadPptx: 'Download .pptx',
  failed: 'Generation failed',
  externalDeckBanner:
    'This deck lives in Gamma. Open it there to edit, or download the .pptx.',
},
```

Mirror the keys (translated) in `zh-CN.ts`.

**Step 4: Verify**

```sh
pnpm --filter @coursewise/web typecheck
pnpm --filter @coursewise/web test
```

Expected: clean.

**Step 5: Commit**

```sh
git add apps/web/src
git commit -m "gamma: dialog + query hooks + i18n strings"
```

---

## Task 6 — List page + presentation detail integration

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherPresentationsPage.tsx` — add the new button + status row + polling.
- Modify: `apps/web/src/pages/teacher/TeacherPresentationEditorPage.tsx` — when `provider === 'gamma'`, render an external-deck banner instead of the slide editor.

**Step 1: Presentations list — new button + post-create polling**

```tsx
// at the top of TeacherPresentationsPage
import { GenerateGammaDialog } from '@/components/gamma/GenerateGammaDialog';
import { useGammaJob } from '@/lib/queries';

// state
const [gammaOpen, setGammaOpen] = useState(false);
const [activeJobId, setActiveJobId] = useState<string | null>(null);
const gammaJob = useGammaJob(activeJobId, !!activeJobId);

useEffect(() => {
  if (gammaJob.data?.status === 'completed' || gammaJob.data?.status === 'failed') {
    qc.invalidateQueries({ queryKey: ['presentations', id] });
    if (gammaJob.data.status === 'failed') {
      toast.push({ title: t('gamma.failed') + ': ' + (gammaJob.data.errorMessage ?? ''), tone: 'error' });
    }
    setActiveJobId(null);
  }
}, [gammaJob.data?.status]);

// button next to "New Presentation"
<Button variant="outline" onClick={() => setGammaOpen(true)}>{t('gamma.generateButton')}</Button>

// dialog
<GenerateGammaDialog
  open={gammaOpen}
  onClose={() => setGammaOpen(false)}
  courseId={id}
  onStarted={(jobId) => setActiveJobId(jobId)}
/>
```

For each row in the list, add Gamma-aware affordances:

```tsx
const isGamma = p.provider === 'gamma';
const isGenerating = activeJobId && gammaJob.data?.presentationId === p.id && gammaJob.data?.status === 'pending';

{isGenerating && (
  <Badge variant="info">{t('gamma.generating')}</Badge>
)}
{isGamma && p.externalUrl && (
  <Button variant="outline" size="sm" asChild>
    <a href={p.externalUrl} target="_blank" rel="noopener noreferrer">{t('gamma.openInGamma')}</a>
  </Button>
)}
{isGamma && p.fileAssetId && (
  <DownloadPptxButton fileAssetId={p.fileAssetId} />
)}
```

`DownloadPptxButton` is a tiny helper that calls `getDownloadUrl(fileAssetId)` then `window.location.href = res.downloadUrl`. Reuse the existing pattern from `TeacherMaterialsPage`'s download flow.

Make sure `PresentationSummary` in `@coursewise/shared` carries `externalUrl`, `provider`, `fileAssetId` — if not, extend it (touched here to keep the diff focused; otherwise add to Task 2).

**Step 2: Presentation detail placeholder**

In `TeacherPresentationEditorPage`, near the top after the data loads:

```tsx
if (presentation?.provider === 'gamma') {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">{presentation.title}</h1>
      <p className="text-muted-foreground">{t('gamma.externalDeckBanner')}</p>
      <div className="flex gap-2">
        {presentation.externalUrl && (
          <Button asChild>
            <a href={presentation.externalUrl} target="_blank" rel="noopener noreferrer">
              {t('gamma.openInGamma')}
            </a>
          </Button>
        )}
        {presentation.fileAssetId && (
          <DownloadPptxButton fileAssetId={presentation.fileAssetId} />
        )}
      </div>
    </div>
  );
}
```

**Step 3: Smoke-test the UI**

Open the teacher Presentations page in the dev server, click "Generate with Gamma", select a material with `sourceType=manual_text`, submit. Watch the row show "Generating with Gamma…". After 1–3 min the badge clears and "Open in Gamma" / "Download .pptx" appear. (If `GAMMA_API_KEY` isn't set, the dialog submit will surface a clear 500 from our Worker, which is acceptable for the first run-through.)

**Step 4: Verify**

```sh
pnpm -r typecheck
pnpm -r test
pnpm lint
```

**Step 5: Commit**

```sh
git add apps/web/src
git commit -m "gamma: list-page button, status polling, external-deck UI"
```

---

## Final review

After all six tasks land, dispatch one more `superpowers:code-reviewer` agent over the full diff to check:

- No unused exports, no leftover scaffolding.
- The migration is forward-only and idempotent.
- Worker bundle size hasn't regressed dramatically (Gamma client is just `fetch` — should be < 5 KB).
- The OpenAPI spec deploys cleanly and the public-route whitelist test still passes.
- i18n parity between `en` and `zh-CN`.

Then open the PR with a brief test plan (Gamma key set on Worker; create a generation; verify the row shows pending → completed; click Open in Gamma; click Download .pptx).
