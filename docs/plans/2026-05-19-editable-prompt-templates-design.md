# Editable prompt templates — design

**Date:** 2026-05-19
**Status:** Approved for implementation

## Goal

Move the four hard-coded pieces of the AI generation prompt
(system prompt, per-module user message, word-target table, max-tokens
table) out of `materialGeneration.ts` and into a DB-backed config that
admins can edit from the existing AI providers admin page. Phase 2 only
ships the `material` artifact kind, but the schema and UI generalize to
the other kinds we'll add later (presentation, assignment, project, quiz).

## Data model

New table, one row per artifact kind:

```ts
ai_prompt_templates {
  id            uuid pk
  kind          ai_artifact_kind unique not null
  system_prompt text not null            // {{var}} substitution
  user_message  text not null            // {{var}} substitution
  depth_config  jsonb not null
    // {
    //   brief:    { wordTarget: "~500 words",  maxTokens: 1200 },
    //   standard: { wordTarget: "~1000 words", maxTokens: 2400 },
    //   detailed: { wordTarget: "~1800 words", maxTokens: 4500 }
    // }
  updated_by    uuid fk -> users(id) null
  updated_at    timestamptz default now()
  created_at    timestamptz default now()
}
```

The migration seeds one row for `'material'` from the current
hard-coded values. Other kinds get rows when their generators ship.

## Templating

Simple `{{name}}` substitution against a fixed allowlist per field.
No conditionals, no loops, no escapes.

| Field           | Allowed variables |
|-----------------|-------------------|
| `system_prompt` | `course.title`, `course.code`, `course.termLabel`, `course.description`, `moduleSummary`, `language`, `wordTarget`, `teacherInstructions` |
| `user_message`  | `module.title`, `module.description` |

Unknown `{{vars}}` substitute to empty string and log a
`console.warn` (mirrors `recordEvent`'s log-and-don't-fail pattern).
Absent values (e.g. `module.description` when null) also become empty
string — there's no fallback-wrapper logic in the template.

## Factory defaults

A new `apps/api/src/services/ai/promptDefaults.ts` exports
`DEFAULT_PROMPT_BY_KIND`, keyed by `ai_artifact_kind`. The seed
migration reads from there. A `POST .../reset` endpoint re-applies the
same defaults. Defaults stay versioned with the app code; the DB holds
whatever admins have customized to.

## API

All under `/api/admin/ai/...`, scope `aiAdmin`:

- `GET  /api/admin/ai/prompts` →
  `{ templates: AiPromptTemplate[] }` (one per kind).
- `PUT  /api/admin/ai/prompts/:kind`
  body `{ systemPrompt, userMessage, depthConfig }`. Zod-validated:
  non-empty strings ≤ 8000 chars, `depthConfig` requires all three
  depths each with `wordTarget: string` and
  `maxTokens: number` (100–32000). Stamps `updatedBy` from auth.
- `POST /api/admin/ai/prompts/:kind/reset` → re-applies
  `DEFAULT_PROMPT_BY_KIND[kind]` and returns the new row.

## Workflow integration (`materialGeneration.ts`)

`loadContext` gains a Drizzle fetch for the prompt template row keyed
by `kind: 'material'`. It enters `JobContext`:

```ts
context.template = {
  systemPrompt: row.systemPrompt,
  userMessage: row.userMessage,
  depthConfig: row.depthConfig,
};
```

A new `interpolate(template, vars)` helper does the `{{name}}`
substitution. Then:

- `buildSystemPrompt(...)` is replaced with
  `interpolate(template.systemPrompt, { 'course.title': course.title,
  ..., moduleSummary, language, wordTarget: depthConfig[depth].wordTarget,
  teacherInstructions: instructions ?? '' })`.
- The hard-coded user-message line becomes
  `interpolate(template.userMessage, { 'module.title': mod.title,
  'module.description': mod.description ?? '' })`.
- `MAX_TOKENS_PER_DEPTH[depth]` becomes
  `depthConfig[depth].maxTokens`. The constants delete from the workflow.

## Admin UI (`AdminAiPage`)

A new **Prompt templates** card, sibling to the existing **Providers**
and **Models** cards. For each row (only `material` in Phase 2):

- Two textareas — system prompt and user message. A right-side help
  panel lists the allowed `{{vars}}` for that field; clicking a var
  inserts it at the cursor.
- A 3-column grid for the depth configs: rows =
  `brief`/`standard`/`detailed`, columns = `wordTarget` (text input)
  and `maxTokens` (number input).
- Sticky footer with **Save** (PUT) and **Reset to defaults** (POST
  `/reset`, behind a small `confirm()` dialog).
- Save disabled until form is dirty and locally validates. Success and
  error toasts use the existing `useToast`.
