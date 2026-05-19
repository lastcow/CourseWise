# Editable Prompt Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the four hard-coded pieces of the AI generation prompt (system prompt, per-module user message, word-targets per depth, max-tokens per depth) out of `materialGeneration.ts` and into a new `ai_prompt_templates` table that admins can edit from the existing AI providers admin page.

**Architecture:** One row per `ai_artifact_kind` (only `material` populated in Phase 2). Factory defaults live in `apps/api/src/services/ai/promptDefaults.ts` and are both loaded by the SQL seed in the migration and re-applied by a `POST .../reset` endpoint. Templates use `{{name}}` substitution against a fixed allowlist per field via a new `interpolate` helper. The workflow's `loadContext` fetches the row and threads it through `JobContext`; `buildSystemPrompt` and the `MAX_TOKENS_PER_DEPTH`/`WORD_TARGETS` constants delete from the workflow file. A new card on `AdminAiPage` exposes the three fields per row.

**Tech Stack:** Drizzle (Postgres), Hono on Cloudflare Workers, Cloudflare Workflows, React + TanStack Query + react-i18next, Vitest.

**Design reference:** `docs/plans/2026-05-19-editable-prompt-templates-design.md`

---

## Task 1 — Defaults module (`promptDefaults.ts`)

**Files:**
- Create: `apps/api/src/services/ai/promptDefaults.ts`

**Step 1: Create the module**

```ts
// apps/api/src/services/ai/promptDefaults.ts
import type { AiArtifactKind } from '@coursewise/shared';

export interface AiPromptDepthEntry {
  wordTarget: string;
  maxTokens: number;
}

export interface AiPromptDepthConfig {
  brief: AiPromptDepthEntry;
  standard: AiPromptDepthEntry;
  detailed: AiPromptDepthEntry;
}

export interface AiPromptTemplateDefaults {
  systemPrompt: string;
  userMessage: string;
  depthConfig: AiPromptDepthConfig;
}

const MATERIAL_SYSTEM_PROMPT = `You are a curriculum-design assistant for a teaching platform.
You write reading materials that are clear, structured, and pedagogically sound.

Course: {{course.title}} ({{course.code}})
{{course.termLabel}}
{{course.description}}

Course modules:
{{moduleSummary}}

When asked to write a reading material for a specific module, follow these rules:
- Output valid Markdown only — no preamble, no commentary, no code fences around the whole thing.
- Begin with a single H2 heading derived from the module title.
- Include a 1–2 paragraph overview, 3–6 main sections each under an H3 heading, and a short summary at the end.
- Use concrete examples where they aid understanding.
- Target length: {{wordTarget}}.
- {{language}}
- Do not duplicate content that obviously belongs to other modules in this course.
{{teacherInstructions}}`;

const MATERIAL_USER_MESSAGE = `Write a reading material for the module titled "{{module.title}}".{{module.description}}`;

export const DEFAULT_PROMPT_BY_KIND: Record<AiArtifactKind, AiPromptTemplateDefaults> = {
  material: {
    systemPrompt: MATERIAL_SYSTEM_PROMPT,
    userMessage: MATERIAL_USER_MESSAGE,
    depthConfig: {
      brief: { wordTarget: '~500 words', maxTokens: 1200 },
      standard: { wordTarget: '~1000 words', maxTokens: 2400 },
      detailed: { wordTarget: '~1800 words', maxTokens: 4500 },
    },
  },
  // Phase 3+: presentation, assignment, project, quiz get added here.
  presentation: PLACEHOLDER_DEFAULTS('presentation'),
  assignment: PLACEHOLDER_DEFAULTS('assignment'),
  project: PLACEHOLDER_DEFAULTS('project'),
  quiz: PLACEHOLDER_DEFAULTS('quiz'),
};

function PLACEHOLDER_DEFAULTS(kind: string): AiPromptTemplateDefaults {
  return {
    systemPrompt: `Defaults not yet defined for kind "${kind}". Edit me in the admin page before enabling generation for this kind.`,
    userMessage: 'TODO',
    depthConfig: {
      brief: { wordTarget: '~500 words', maxTokens: 1200 },
      standard: { wordTarget: '~1000 words', maxTokens: 2400 },
      detailed: { wordTarget: '~1800 words', maxTokens: 4500 },
    },
  };
}
```

Note: `AiArtifactKind` does not currently exist in `@coursewise/shared`. If it isn't exported yet, locally define it as a type union from the same string literals as `aiArtifactKindEnum` (`apps/api/src/db/schema.ts:98`) and add the export to shared in Task 4. Until then, inline the type:

```ts
type AiArtifactKind = 'material' | 'presentation' | 'assignment' | 'project' | 'quiz';
```

**Step 2: Typecheck**

```bash
cd /Users/zhijiangchen/CourseWise/apps/api && pnpm typecheck
```
Expected: 0 errors.

**Step 3: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/api/src/services/ai/promptDefaults.ts
git commit -m "feat(ai): prompt template defaults module"
```

---

## Task 2 — `interpolate` helper (TDD)

**Files:**
- Create: `apps/api/src/services/ai/interpolate.ts`
- Test: `apps/api/src/services/ai/interpolate.test.ts`

**Step 1: Write the failing tests**

```ts
// apps/api/src/services/ai/interpolate.test.ts
import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolate';

describe('interpolate', () => {
  it('replaces known variables', () => {
    expect(
      interpolate('Hi {{name}}, welcome to {{course.title}}.', {
        name: 'Ada',
        'course.title': 'CS 101',
      }),
    ).toBe('Hi Ada, welcome to CS 101.');
  });

  it('substitutes empty string for variables in the allowlist with empty values', () => {
    expect(interpolate('Tag: {{tag}}.', { tag: '' })).toBe('Tag: .');
  });

  it('leaves unknown variables out and warns', () => {
    const warnings: unknown[][] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      expect(interpolate('{{ok}} / {{nope}}', { ok: 'A' })).toBe('A / ');
      expect(warnings.length).toBeGreaterThan(0);
      const flat = JSON.stringify(warnings);
      expect(flat).toMatch(/nope/);
    } finally {
      console.warn = orig;
    }
  });

  it('handles a variable appearing multiple times', () => {
    expect(interpolate('{{x}}-{{x}}-{{x}}', { x: '7' })).toBe('7-7-7');
  });

  it('returns the template unchanged when there are no placeholders', () => {
    expect(interpolate('plain text', { unused: 'value' })).toBe('plain text');
  });

  it('does not interpret dollar signs or backticks specially', () => {
    expect(interpolate('cost: ${{cost}}/1M', { cost: '3.00' })).toBe('cost: $3.00/1M');
  });
});
```

Run:
```bash
cd /Users/zhijiangchen/CourseWise/apps/api && pnpm test src/services/ai/interpolate.test.ts
```
Expected: FAIL with "Cannot find module './interpolate'".

**Step 2: Implement**

```ts
// apps/api/src/services/ai/interpolate.ts
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Replace `{{name}}` occurrences in `template` with values from `vars`.
 * - Variable names not in `vars` substitute to '' and emit one console.warn.
 * - Empty-string values pass through as ''.
 * - No conditionals, no escapes, no nested templates.
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  const missing = new Set<string>();
  const out = template.replace(PLACEHOLDER_RE, (_, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name] ?? '';
    missing.add(name);
    return '';
  });
  if (missing.size > 0) {
    console.warn('interpolate: unknown variables', { missing: Array.from(missing) });
  }
  return out;
}
```

**Step 3: Re-run tests**

```bash
cd /Users/zhijiangchen/CourseWise/apps/api && pnpm test src/services/ai/interpolate.test.ts
```
Expected: 6 passed.

**Step 4: Commit**

```bash
git add apps/api/src/services/ai/interpolate.ts apps/api/src/services/ai/interpolate.test.ts
git commit -m "feat(ai): interpolate helper for prompt templates"
```

---

## Task 3 — Schema + migration `0009_ai_prompt_templates.sql`

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0009_ai_prompt_templates.sql`
- Modify: `apps/api/drizzle/meta/_journal.json` (add entry idx 9)

**Step 1: Add the Drizzle table**

Append immediately after the `aiGenerationEvents` block in `apps/api/src/db/schema.ts`:

```ts
export const aiPromptTemplates = pgTable(
  'ai_prompt_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: aiArtifactKindEnum('kind').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    userMessage: text('user_message').notNull(),
    depthConfig: jsonb('depth_config')
      .$type<{
        brief: { wordTarget: string; maxTokens: number };
        standard: { wordTarget: string; maxTokens: number };
        detailed: { wordTarget: string; maxTokens: number };
      }>()
      .notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => ({
    kindUnique: uniqueIndex('ai_prompt_templates_kind_unique').on(t.kind),
  }),
);

export type AiPromptTemplateRow = typeof aiPromptTemplates.$inferSelect;
```

Make sure `uniqueIndex` is imported at the top of `schema.ts`. Other tables in this file use it — search to confirm the import alias.

**Step 2: Write the migration `0009_ai_prompt_templates.sql`**

```sql
CREATE TABLE IF NOT EXISTS "ai_prompt_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "ai_artifact_kind" NOT NULL,
  "system_prompt" text NOT NULL,
  "user_message" text NOT NULL,
  "depth_config" jsonb NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "ai_prompt_templates_updated_by_fkey"
   FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_prompt_templates_kind_unique"
  ON "ai_prompt_templates" ("kind");
--> statement-breakpoint
-- Seed: one row per artifact kind. The `material` row uses the real default
-- content; the other kinds get placeholders that admins must edit before
-- generation is enabled for them (Phase 3+).
INSERT INTO "ai_prompt_templates" ("kind", "system_prompt", "user_message", "depth_config")
VALUES (
  'material',
  $material_system$You are a curriculum-design assistant for a teaching platform.
You write reading materials that are clear, structured, and pedagogically sound.

Course: {{course.title}} ({{course.code}})
{{course.termLabel}}
{{course.description}}

Course modules:
{{moduleSummary}}

When asked to write a reading material for a specific module, follow these rules:
- Output valid Markdown only — no preamble, no commentary, no code fences around the whole thing.
- Begin with a single H2 heading derived from the module title.
- Include a 1–2 paragraph overview, 3–6 main sections each under an H3 heading, and a short summary at the end.
- Use concrete examples where they aid understanding.
- Target length: {{wordTarget}}.
- {{language}}
- Do not duplicate content that obviously belongs to other modules in this course.
{{teacherInstructions}}$material_system$,
  $material_user$Write a reading material for the module titled "{{module.title}}".{{module.description}}$material_user$,
  '{"brief": {"wordTarget": "~500 words", "maxTokens": 1200}, "standard": {"wordTarget": "~1000 words", "maxTokens": 2400}, "detailed": {"wordTarget": "~1800 words", "maxTokens": 4500}}'::jsonb
)
ON CONFLICT ("kind") DO NOTHING;
--> statement-breakpoint
INSERT INTO "ai_prompt_templates" ("kind", "system_prompt", "user_message", "depth_config")
SELECT k.kind, 'Defaults not yet defined for kind "' || k.kind || '". Edit me in the admin page before enabling generation for this kind.', 'TODO',
  '{"brief": {"wordTarget": "~500 words", "maxTokens": 1200}, "standard": {"wordTarget": "~1000 words", "maxTokens": 2400}, "detailed": {"wordTarget": "~1800 words", "maxTokens": 4500}}'::jsonb
FROM (VALUES ('presentation'::ai_artifact_kind), ('assignment'::ai_artifact_kind), ('project'::ai_artifact_kind), ('quiz'::ai_artifact_kind)) AS k(kind)
ON CONFLICT ("kind") DO NOTHING;
```

**Step 3: Update the journal**

Open `apps/api/drizzle/meta/_journal.json` and append:

```json
{
  "idx": 9,
  "version": "7",
  "when": <previous_when + 86400000>,
  "tag": "0009_ai_prompt_templates",
  "breakpoints": true
}
```

Compute `when` by reading entry 8's value and adding `86400000` (the pattern used by 0001–0008).

**Step 4: Apply the migration**

```bash
cd /Users/zhijiangchen/CourseWise
psql "$(grep ^DATABASE_URL apps/api/.dev.vars | cut -d= -f2-)" -f apps/api/drizzle/0009_ai_prompt_templates.sql
```

If `pnpm db:migrate` works on your env, use that instead. The Neon HTTP driver + `DO $$ ... $$` blocks have been flaky in this repo (see Task 1 of `2026-05-18-realtime-agent-output-plan.md`); psql is the reliable fallback.

**Step 5: Verify**

```bash
psql "$DATABASE_URL" -c "\d ai_prompt_templates"
psql "$DATABASE_URL" -c "SELECT kind, length(system_prompt) AS sys_len, length(user_message) AS msg_len FROM ai_prompt_templates ORDER BY kind;"
```
Expected: 5 rows (`assignment`, `material`, `presentation`, `project`, `quiz`). The `material` row's `sys_len` should be roughly 800–900 chars; the others ~100.

**Step 6: Typecheck + tests**

```bash
cd apps/api && pnpm typecheck && pnpm test
```
Expected: 0 errors. No regressions.

**Step 7: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/api/src/db/schema.ts apps/api/drizzle/0009_ai_prompt_templates.sql apps/api/drizzle/meta/_journal.json
git commit -m "feat(ai): ai_prompt_templates table with seed rows"
```

---

## Task 4 — Shared types + Zod schemas

**Files:**
- Modify: `packages/shared/src/validators.ts`
- Modify: `apps/api/src/services/ai/promptDefaults.ts` (drop the inline `AiArtifactKind` type if Task 1 inlined it)

**Step 1: Add types and the artifact-kind constants**

In `packages/shared/src/validators.ts`, locate the existing `AiJobEvent` interface and add the following near it (search for `AiJobEvent`; insert after it):

```ts
export const AI_ARTIFACT_KINDS = [
  'material',
  'presentation',
  'assignment',
  'project',
  'quiz',
] as const;
export type AiArtifactKind = (typeof AI_ARTIFACT_KINDS)[number];

export interface AiPromptDepthEntry {
  wordTarget: string;
  maxTokens: number;
}

export interface AiPromptDepthConfig {
  brief: AiPromptDepthEntry;
  standard: AiPromptDepthEntry;
  detailed: AiPromptDepthEntry;
}

export interface AiPromptTemplate {
  id: string;
  kind: AiArtifactKind;
  systemPrompt: string;
  userMessage: string;
  depthConfig: AiPromptDepthConfig;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}
```

**Step 2: Add the Zod schema for the PUT body**

Append below the type block:

```ts
const aiPromptDepthEntrySchema = z.object({
  wordTarget: z.string().trim().min(1).max(120),
  maxTokens: z.number().int().min(100).max(32000),
});

export const updateAiPromptTemplateSchema = z.object({
  systemPrompt: z.string().trim().min(1).max(8000),
  userMessage: z.string().trim().min(1).max(8000),
  depthConfig: z.object({
    brief: aiPromptDepthEntrySchema,
    standard: aiPromptDepthEntrySchema,
    detailed: aiPromptDepthEntrySchema,
  }),
});
export type UpdateAiPromptTemplateInput = z.infer<typeof updateAiPromptTemplateSchema>;
```

`z` is already imported at the top of `validators.ts`. Confirm.

**Step 3: Update `promptDefaults.ts` to import `AiArtifactKind` from shared**

In `apps/api/src/services/ai/promptDefaults.ts`, change:
```ts
type AiArtifactKind = 'material' | 'presentation' | 'assignment' | 'project' | 'quiz';
```
to:
```ts
import type { AiArtifactKind } from '@coursewise/shared';
```

Also re-export the depth types from shared and use those:

```ts
import type { AiArtifactKind, AiPromptDepthConfig } from '@coursewise/shared';

export interface AiPromptTemplateDefaults {
  systemPrompt: string;
  userMessage: string;
  depthConfig: AiPromptDepthConfig;
}
```

Delete the local `AiPromptDepthEntry` and `AiPromptDepthConfig` declarations (use shared).

**Step 4: Typecheck both packages**

```bash
cd packages/shared && pnpm typecheck
cd ../../apps/api && pnpm typecheck
cd ../web && pnpm typecheck
```
Expected: 0 errors everywhere.

**Step 5: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add packages/shared/src/validators.ts apps/api/src/services/ai/promptDefaults.ts
git commit -m "feat(ai): shared types + zod schema for prompt templates"
```

---

## Task 5 — Admin API endpoints

**Files:**
- Modify: `apps/api/src/routes/admin/ai.ts`

**Step 1: Add the three handlers**

At the top of the file, add imports:

```ts
import {
  // ...existing imports...
  updateAiPromptTemplateSchema,
  type AiPromptTemplate,
  type AiArtifactKind,
  AI_ARTIFACT_KINDS,
  type UpdateAiPromptTemplateInput,
} from '@coursewise/shared';
import { aiPromptTemplates } from '../../db/schema';
import { DEFAULT_PROMPT_BY_KIND } from '../../services/ai/promptDefaults';
```

Add a row-mapper near the existing `toProviderSummary` / `toModelSummary` helpers:

```ts
function toPromptTemplate(row: typeof aiPromptTemplates.$inferSelect): AiPromptTemplate {
  return {
    id: row.id,
    kind: row.kind as AiArtifactKind,
    systemPrompt: row.systemPrompt,
    userMessage: row.userMessage,
    depthConfig: row.depthConfig,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}
```

Add the three routes at the bottom of the file (before the `export default ai;` line, which exists at the end of the existing module):

```ts
// ---------- Prompt templates ----------
ai.get('/prompts', requireScopeGroup('aiAdminRead'), async (c) => {
  const db = c.get('db');
  const rows = await db.select().from(aiPromptTemplates).orderBy(asc(aiPromptTemplates.kind));
  const templates = rows.map(toPromptTemplate);
  return success(c, { templates });
});

ai.put(
  '/prompts/:kind',
  requireScopeGroup('aiAdminWrite'),
  validateJson(updateAiPromptTemplateSchema),
  async (c) => {
    const kind = c.req.param('kind') as AiArtifactKind;
    if (!AI_ARTIFACT_KINDS.includes(kind)) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Unknown artifact kind.');
    }
    const input = c.get('validated') as UpdateAiPromptTemplateInput;
    const auth = c.get('auth');
    const db = c.get('db');
    const [row] = await db
      .update(aiPromptTemplates)
      .set({
        systemPrompt: input.systemPrompt,
        userMessage: input.userMessage,
        depthConfig: input.depthConfig,
        updatedBy: auth.user.id,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(aiPromptTemplates.kind, kind))
      .returning();
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Prompt template not found.');
    await recordAudit(db, {
      actorType: auth.method === 'api_token' ? 'api_token' : 'user',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'admin.ai.prompts.update',
      target: row.id,
      metadata: { kind },
    });
    return success(c, toPromptTemplate(row));
  },
);

ai.post('/prompts/:kind/reset', requireScopeGroup('aiAdminWrite'), async (c) => {
  const kind = c.req.param('kind') as AiArtifactKind;
  if (!AI_ARTIFACT_KINDS.includes(kind)) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Unknown artifact kind.');
  }
  const defaults = DEFAULT_PROMPT_BY_KIND[kind];
  const auth = c.get('auth');
  const db = c.get('db');
  const [row] = await db
    .update(aiPromptTemplates)
    .set({
      systemPrompt: defaults.systemPrompt,
      userMessage: defaults.userMessage,
      depthConfig: defaults.depthConfig,
      updatedBy: auth.user.id,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(aiPromptTemplates.kind, kind))
    .returning();
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Prompt template not found.');
  await recordAudit(db, {
    actorType: auth.method === 'api_token' ? 'api_token' : 'user',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'admin.ai.prompts.reset',
    target: row.id,
    metadata: { kind },
  });
  return success(c, toPromptTemplate(row));
});
```

**Step 2: Typecheck + tests**

```bash
cd /Users/zhijiangchen/CourseWise/apps/api && pnpm typecheck && pnpm test
```
Expected: 0 errors. No regressions.

**Step 3: Quick live smoke (optional)**

Run the worker (`pnpm --filter @coursewise/api dev`) then in another shell:

```bash
TOKEN=<an admin Bearer token>
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:8787/api/admin/ai/prompts | jq '.data.templates | map({kind, sys_len: (.systemPrompt | length)})'
```
Expected: 5 entries with `material` having the longest `sys_len`.

**Step 4: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/api/src/routes/admin/ai.ts
git commit -m "feat(ai): admin endpoints for prompt templates (list, update, reset)"
```

---

## Task 6 — Workflow integration

**Files:**
- Modify: `apps/api/src/workflows/materialGeneration.ts`

**Step 1: Update `JobContext` and load the template**

In `JobContext` (currently at the top of the file), add:

```ts
template: {
  systemPrompt: string;
  userMessage: string;
  depthConfig: {
    brief: { wordTarget: string; maxTokens: number };
    standard: { wordTarget: string; maxTokens: number };
    detailed: { wordTarget: string; maxTokens: number };
  };
};
```

Remove `systemCacheable: string;` from `JobContext`.

In `loadContext`, fetch the prompt template alongside the other lookups:

```ts
const templateRows = await db
  .select()
  .from(aiPromptTemplates)
  .where(eq(aiPromptTemplates.kind, 'material'))
  .limit(1);
const templateRow = templateRows[0];
if (!templateRow) {
  throw new Error('Prompt template for kind "material" is missing — run the 0009 migration.');
}
```

Add `aiPromptTemplates` to the schema imports.

At the bottom of `loadContext`, replace `systemCacheable: buildSystemPrompt(...)` with:

```ts
template: {
  systemPrompt: templateRow.systemPrompt,
  userMessage: templateRow.userMessage,
  depthConfig: templateRow.depthConfig,
},
```

**Step 2: Replace `buildSystemPrompt` with `interpolate`**

At the top of the file:

```ts
import { interpolate } from '../services/ai/interpolate';
```

In the `mark-running` step, the `recordEvent('context.loaded', ...)` call currently references `context.systemCacheable.length`. Replace those references — the rendered system prompt isn't computed in this step anymore; report the *template* length instead:

```ts
`Loaded course context (${context.template.systemPrompt.length} chars in template, ${context.moduleIds.length} module${context.moduleIds.length === 1 ? '' : 's'})`,
{ templateChars: context.template.systemPrompt.length, moduleCount: context.moduleIds.length },
```

Then update `generateMaterialForModule`. The current code builds `userMessage` inline and passes `context.systemCacheable` as the cacheable system block. Replace both:

```ts
// (a) Build the system prompt at call time:
const langLine = context.language === 'zh-CN' ? 'Write in Simplified Chinese.' : 'Write in English.';
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
```

The `callAnthropic` arguments change:

```ts
system: { cacheable: systemPrompt },
userMessage,
maxTokens: depthEntry.maxTokens,
```

**Step 3: Extend `JobContext` with the raw course fields**

The new substitution variables need `course.title`, `course.code`, `course.termLabel`, `course.description`, and `moduleSummary` available on the context. Add these to `JobContext` and populate them in `loadContext` (the existing code already reads them; just store them on the context instead of pre-rendering):

```ts
interface JobContext {
  // ...existing fields...
  courseTitle: string;
  courseCode: string;
  courseTermLabel: string | null;
  courseDescription: string | null;
  moduleSummary: string;
  // (drop systemCacheable)
}
```

In `loadContext`, after the existing `moduleSummary` computation, add these to the returned object.

**Step 4: Delete now-dead code**

- Delete `buildSystemPrompt` (the function at the bottom of the file).
- Delete `MAX_TOKENS_PER_DEPTH` and `WORD_TARGETS` constants (the const objects near the top of the file).

**Step 5: Typecheck + tests**

```bash
cd /Users/zhijiangchen/CourseWise/apps/api && pnpm typecheck && pnpm test
```
Expected: 0 errors. No regressions.

**Step 6: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/api/src/workflows/materialGeneration.ts
git commit -m "feat(ai): workflow uses ai_prompt_templates via interpolate"
```

---

## Task 7 — Web query hooks

**Files:**
- Modify: `apps/web/src/lib/queries.ts`

**Step 1: Add the three hooks**

Find the existing `useAiProviders` / `useAiModels` block (search for `useAiProviders`) and append:

```ts
import type {
  // existing imports...
  AiPromptTemplate,
  AiArtifactKind,
  UpdateAiPromptTemplateInput,
} from '@coursewise/shared';

// ...

export function useAiPromptTemplates() {
  return useQuery({
    queryKey: ['ai', 'prompts'],
    queryFn: async () => {
      const res = await apiCall<{ templates: AiPromptTemplate[] }>('/api/admin/ai/prompts');
      return res.templates;
    },
  });
}

export function useUpdateAiPromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, input }: { kind: AiArtifactKind; input: UpdateAiPromptTemplateInput }) =>
      apiCall<AiPromptTemplate>(`/api/admin/ai/prompts/${kind}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'prompts'] });
    },
  });
}

export function useResetAiPromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: AiArtifactKind) =>
      apiCall<AiPromptTemplate>(`/api/admin/ai/prompts/${kind}/reset`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'prompts'] });
    },
  });
}
```

If you find the `apiCall` signature only supports body via a different shape, mirror the pattern used by the existing model/provider mutations in this file. Read those first to be sure.

**Step 2: Typecheck**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck
```
Expected: 0 errors.

**Step 3: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/lib/queries.ts
git commit -m "feat(ai): web query hooks for prompt templates"
```

---

## Task 8 — i18n strings

**Files:**
- Modify: `apps/web/src/locales/en.ts`
- Modify: `apps/web/src/locales/zh-CN.ts`

**Step 1: Add the `prompts` block in en.ts**

Inside the `ai` block, alongside the existing `activity` block:

```ts
prompts: {
  title: 'Prompt templates',
  description:
    'Customize the system prompt, per-module user message, and depth knobs sent to the model. Variables in {{double braces}} are substituted at generation time.',
  systemLabel: 'System prompt',
  userMessageLabel: 'User message',
  variablesLabel: 'Available variables',
  insertVariable: 'Insert',
  depthLabel: 'Depth tuning',
  wordTargetLabel: 'Word target',
  maxTokensLabel: 'Max tokens',
  save: 'Save changes',
  reset: 'Reset to defaults',
  resetConfirm: 'Reset this template to the built-in defaults? Your edits will be lost.',
  saved: 'Prompt template saved',
  resetDone: 'Prompt template reset',
  kindHeader: 'Kind',
  empty: 'No prompt templates configured.',
  validation: {
    required: 'This field is required.',
    tooLong: 'Maximum 8000 characters.',
    tokensRange: 'Must be between 100 and 32000.',
  },
},
```

**Step 2: Mirror into zh-CN.ts** with translations:

```ts
prompts: {
  title: '提示词模板',
  description:
    '自定义发送给模型的系统提示、按章节的用户消息以及长度参数。生成时会替换{{双花括号}}中的变量。',
  systemLabel: '系统提示',
  userMessageLabel: '用户消息',
  variablesLabel: '可用变量',
  insertVariable: '插入',
  depthLabel: '长度参数',
  wordTargetLabel: '字数目标',
  maxTokensLabel: '最大 Token',
  save: '保存',
  reset: '恢复默认',
  resetConfirm: '将此模板恢复为内置默认值吗?你的修改将丢失。',
  saved: '模板已保存',
  resetDone: '模板已恢复默认',
  kindHeader: '类型',
  empty: '暂未配置提示词模板。',
  validation: {
    required: '必填项。',
    tooLong: '最多 8000 字符。',
    tokensRange: '取值必须在 100 到 32000 之间。',
  },
},
```

**Step 3: Typecheck**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck
```
Expected: 0 errors.

**Step 4: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/locales/en.ts apps/web/src/locales/zh-CN.ts
git commit -m "i18n: strings for prompt template editor"
```

---

## Task 9 — Admin UI card

**Files:**
- Create: `apps/web/src/components/admin/PromptTemplateCard.tsx`
- Modify: `apps/web/src/pages/admin/AdminAiPage.tsx`

**Step 1: Build `PromptTemplateCard.tsx`**

This is the largest single file in the plan. Read the existing AdminAiPage and the existing `Card`/`Label`/`Textarea`/`Input`/`Button` UI primitives to match conventions. Skeleton:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Save } from 'lucide-react';
import type {
  AiArtifactKind,
  AiPromptDepthConfig,
  AiPromptTemplate,
  UpdateAiPromptTemplateInput,
} from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  useAiPromptTemplates,
  useResetAiPromptTemplate,
  useUpdateAiPromptTemplate,
} from '@/lib/queries';

const SYSTEM_VARIABLES = [
  'course.title',
  'course.code',
  'course.termLabel',
  'course.description',
  'moduleSummary',
  'language',
  'wordTarget',
  'teacherInstructions',
] as const;

const USER_MESSAGE_VARIABLES = ['module.title', 'module.description'] as const;

type Depth = 'brief' | 'standard' | 'detailed';
const DEPTHS: Depth[] = ['brief', 'standard', 'detailed'];

export function PromptTemplateCard(): JSX.Element {
  const { t } = useTranslation();
  const templatesQ = useAiPromptTemplates();
  const templates = templatesQ.data ?? [];
  const [activeKind, setActiveKind] = useState<AiArtifactKind | null>(null);

  // Default to the first template once loaded.
  const effectiveKind = activeKind ?? templates[0]?.kind ?? null;
  const active = effectiveKind ? templates.find((t) => t.kind === effectiveKind) ?? null : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('ai.prompts.title')}</CardTitle>
        <CardDescription>{t('ai.prompts.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {templatesQ.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : templates.length === 0 ? (
          <p className="rounded border bg-muted/30 p-3 text-sm text-muted-foreground">
            {t('ai.prompts.empty')}
          </p>
        ) : (
          <div className="space-y-4">
            <KindTabs kinds={templates.map((t) => t.kind)} active={effectiveKind} onChange={setActiveKind} />
            {active ? <PromptTemplateForm key={active.id} template={active} /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KindTabs({
  kinds,
  active,
  onChange,
}: {
  kinds: AiArtifactKind[];
  active: AiArtifactKind | null;
  onChange: (k: AiArtifactKind) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={
            'rounded-full border px-3 py-1 text-xs ' +
            (k === active ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')
          }
        >
          {t(`ai.prompts.kindHeader`)}: {k}
        </button>
      ))}
    </div>
  );
}

function PromptTemplateForm({ template }: { template: AiPromptTemplate }): JSX.Element {
  const { t } = useTranslation();
  const updateM = useUpdateAiPromptTemplate();
  const resetM = useResetAiPromptTemplate();
  const toast = useToast();

  const [systemPrompt, setSystemPrompt] = useState(template.systemPrompt);
  const [userMessage, setUserMessage] = useState(template.userMessage);
  const [depthConfig, setDepthConfig] = useState<AiPromptDepthConfig>(template.depthConfig);

  const sysRef = useRef<HTMLTextAreaElement>(null);
  const usrRef = useRef<HTMLTextAreaElement>(null);

  const dirty = useMemo(
    () =>
      systemPrompt !== template.systemPrompt ||
      userMessage !== template.userMessage ||
      JSON.stringify(depthConfig) !== JSON.stringify(template.depthConfig),
    [systemPrompt, userMessage, depthConfig, template],
  );

  // Local validation — server is the source of truth, this is just to gate Save.
  const valid = useMemo(() => {
    if (!systemPrompt.trim() || systemPrompt.length > 8000) return false;
    if (!userMessage.trim() || userMessage.length > 8000) return false;
    for (const d of DEPTHS) {
      const e = depthConfig[d];
      if (!e.wordTarget.trim()) return false;
      if (!Number.isInteger(e.maxTokens) || e.maxTokens < 100 || e.maxTokens > 32000) return false;
    }
    return true;
  }, [systemPrompt, userMessage, depthConfig]);

  function insertAt(ref: React.RefObject<HTMLTextAreaElement>, varName: string): void {
    const el = ref.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const after = el.value.slice(el.selectionEnd);
    const inserted = `{{${varName}}}`;
    const next = before + inserted + after;
    if (ref === sysRef) setSystemPrompt(next);
    else setUserMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = before.length + inserted.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  async function onSave(): Promise<void> {
    const input: UpdateAiPromptTemplateInput = {
      systemPrompt: systemPrompt.trim(),
      userMessage: userMessage.trim(),
      depthConfig,
    };
    try {
      await updateM.mutateAsync({ kind: template.kind, input });
      toast.push({ title: t('ai.prompts.saved'), tone: 'success' });
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    }
  }

  async function onReset(): Promise<void> {
    if (!confirm(t('ai.prompts.resetConfirm'))) return;
    try {
      await resetM.mutateAsync(template.kind);
      toast.push({ title: t('ai.prompts.resetDone'), tone: 'success' });
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    }
  }

  return (
    <div className="space-y-5">
      <PromptField
        label={t('ai.prompts.systemLabel')}
        value={systemPrompt}
        onChange={setSystemPrompt}
        variables={SYSTEM_VARIABLES}
        onInsertVariable={(v) => insertAt(sysRef, v)}
        textareaRef={sysRef}
        rows={14}
      />
      <PromptField
        label={t('ai.prompts.userMessageLabel')}
        value={userMessage}
        onChange={setUserMessage}
        variables={USER_MESSAGE_VARIABLES}
        onInsertVariable={(v) => insertAt(usrRef, v)}
        textareaRef={usrRef}
        rows={4}
      />
      <DepthGrid value={depthConfig} onChange={setDepthConfig} />
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onReset} disabled={resetM.isPending} type="button">
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> {t('ai.prompts.reset')}
        </Button>
        <Button onClick={onSave} disabled={!dirty || !valid || updateM.isPending} type="button">
          <Save className="mr-1 h-3.5 w-3.5" /> {t('ai.prompts.save')}
        </Button>
      </div>
    </div>
  );
}

function PromptField({
  label,
  value,
  onChange,
  variables,
  onInsertVariable,
  textareaRef,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  variables: readonly string[];
  onInsertVariable: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  rows: number;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
      <div className="space-y-1">
        <Label>{label}</Label>
        <Textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
          maxLength={8000}
        />
      </div>
      <div className="space-y-1">
        <Label>{t('ai.prompts.variablesLabel')}</Label>
        <ul className="space-y-1 rounded border bg-muted/30 p-2 text-xs">
          {variables.map((v) => (
            <li key={v} className="flex items-center justify-between gap-2">
              <code className="truncate text-[11px]">{`{{${v}}}`}</code>
              <button
                type="button"
                onClick={() => onInsertVariable(v)}
                className="rounded border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
              >
                {t('ai.prompts.insertVariable')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DepthGrid({
  value,
  onChange,
}: {
  value: AiPromptDepthConfig;
  onChange: (next: AiPromptDepthConfig) => void;
}): JSX.Element {
  const { t } = useTranslation();
  function update(depth: Depth, patch: Partial<{ wordTarget: string; maxTokens: number }>): void {
    onChange({ ...value, [depth]: { ...value[depth], ...patch } });
  }
  return (
    <div className="space-y-1">
      <Label>{t('ai.prompts.depthLabel')}</Label>
      <div className="grid grid-cols-[100px_1fr_140px] gap-2 text-xs">
        <div />
        <div className="text-muted-foreground">{t('ai.prompts.wordTargetLabel')}</div>
        <div className="text-muted-foreground">{t('ai.prompts.maxTokensLabel')}</div>
        {DEPTHS.map((d) => (
          <DepthRow key={d} depth={d} entry={value[d]} onChange={(patch) => update(d, patch)} />
        ))}
      </div>
    </div>
  );
}

function DepthRow({
  depth,
  entry,
  onChange,
}: {
  depth: Depth;
  entry: { wordTarget: string; maxTokens: number };
  onChange: (patch: Partial<{ wordTarget: string; maxTokens: number }>) => void;
}): JSX.Element {
  return (
    <>
      <div className="self-center font-medium">{depth}</div>
      <Input
        value={entry.wordTarget}
        onChange={(e) => onChange({ wordTarget: e.target.value })}
        maxLength={120}
      />
      <Input
        type="number"
        min={100}
        max={32000}
        value={entry.maxTokens}
        onChange={(e) => onChange({ maxTokens: Number(e.target.value) || 0 })}
      />
    </>
  );
}
```

Confirm the `Input` and `Textarea` components forward `ref` and accept the props used above. If they don't, swap to native `<input>`/`<textarea>` and report.

**Step 2: Wire it into `AdminAiPage`**

In `apps/web/src/pages/admin/AdminAiPage.tsx`, add an import and render the card as a sibling of the existing **Models** card. Place it under Models (last in the page):

```tsx
import { PromptTemplateCard } from '@/components/admin/PromptTemplateCard';
// ...
<PromptTemplateCard />
```

Don't remove any existing JSX.

**Step 3: Typecheck + tests**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck && pnpm test
```
Expected: 0 errors. App smoke test still passes.

**Step 4: Manual smoke**

This task should be eyeballed in a browser. Run:

```bash
cd /Users/zhijiangchen/CourseWise && pnpm dev
```

Sign in as an admin, open `/admin/ai`. Verify:
- The Prompt templates card appears under Models.
- Tabs show 5 artifact kinds.
- `material` is selected by default and has full content.
- Click an `{{Insert}}` button — variable appears at cursor.
- Edit the system prompt; Save button enables; click Save; toast appears.
- Reset shows a confirm; on accept, content reverts to defaults.

**Step 5: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/components/admin/PromptTemplateCard.tsx apps/web/src/pages/admin/AdminAiPage.tsx
git commit -m "feat(ai): admin UI card for editing prompt templates"
```

---

## Task 10 — Push & open PR

**Files:** _(none)_

**Step 1: Push the branch**

```bash
cd /Users/zhijiangchen/CourseWise
git push -u origin editable-prompt-templates-design
```

**Step 2: Open the PR**

```bash
gh pr create --title "Editable prompt templates for AI generation" --body "$(cat <<'EOF'
## Summary
- Add a new `ai_prompt_templates` table — one row per artifact kind — that holds the system prompt, per-module user message, and per-depth word-target + max-tokens.
- Default content stays in `apps/api/src/services/ai/promptDefaults.ts` and is both loaded by the migration seed and re-applied by a `POST .../reset` endpoint.
- `{{name}}` substitution via a new `interpolate` helper with a fixed allowlist per field; unknown vars resolve to empty + a `console.warn` (mirrors `recordEvent`'s log-and-don't-fail pattern).
- `MaterialGenerationWorkflow` no longer builds the system prompt or the user message inline — it loads the template row in `loadContext` and interpolates per call.
- New admin card on `/admin/ai` lets admins edit system prompt / user message / depth config per artifact kind, with click-to-insert variable chips and Reset to defaults.

Design: `docs/plans/2026-05-19-editable-prompt-templates-design.md`
Plan: `docs/plans/2026-05-19-editable-prompt-templates-plan.md`

## Test plan
- [x] `pnpm --filter @coursewise/api typecheck` clean.
- [x] `pnpm --filter @coursewise/api test` — new `interpolate.test.ts` covers substitution, unknown-vars warning, idempotence; existing tests still pass.
- [x] `pnpm --filter @coursewise/shared typecheck` clean.
- [x] `pnpm --filter coursewise-web typecheck` clean.
- [ ] Live smoke against a Neon DB: `psql … -c "SELECT kind FROM ai_prompt_templates"` returns 5 rows.
- [ ] Admin UI: edit the `material` system prompt, save, then kick off a generation — the saved content reaches Claude verbatim (verify via `wrangler tail`).
- [ ] Reset to defaults restores the original content; tested both via the API and via the UI button.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope (intentionally)

- Per-course or per-teacher overrides. Single global template per artifact kind.
- Template versioning / history (the `updated_by`/`updated_at` columns capture the *last* edit; if a richer audit story is needed later, the existing `audits` table already records each `admin.ai.prompts.update` event).
- Live preview of the rendered prompt. Could be added as a follow-up `POST /api/admin/ai/prompts/:kind/preview` that takes example variable values and returns the interpolated string.
- Validation that required variables exist in the template. Admins can save a template without any `{{vars}}` — that's fine, it just produces a static prompt.

## Notes for the implementer

- **DRY:** the substitution variables are listed in three places — the defaults file, the admin UI cheat sheet, and the workflow call site. That's intentional and small enough not to abstract. If they ever drift, the abstraction can come later.
- **TDD only on `interpolate`.** The rest is wiring; the existing test suite plus manual UI smoke is enough.
- **Cloudflare Workflow caching:** `system.cacheable` in `callAnthropic` is a *Claude prompt-cache* hint, not a Cloudflare cache. Editing the system prompt invalidates the cache key for the next request — that's fine and intended.
- **Frequent commits.** One per task. Don't squash.
