# Realtime agent output — design

**Date:** 2026-05-18
**Status:** Approved for implementation

## Goal

Give teachers a live, step-by-step view of what an AI generation job is doing
while it runs, instead of only seeing terminal status (`queued` → `running` →
`succeeded`/`failed`) plus token totals.

Out of scope: streaming the LLM's token output itself. We log structured step
events, not Anthropic SSE chunks. That keeps the change inside the existing
Cloudflare Workflow architecture and reuses the existing 2-second polling
loop.

## Data model

New table `ai_generation_events`, appended-to as the workflow progresses:

```ts
ai_generation_events {
  id          uuid pk
  job_id      uuid fk -> ai_generation_jobs(id) on delete cascade
  artifact_id uuid nullable           // null for job-scoped events
  level       enum('info','warn','error')
  type        text                    // see vocabulary below
  message     text                    // short human-readable line
  metadata    jsonb nullable          // e.g. {tokens: {...}, modelId, moduleTitle}
  occurred_at timestamptz default now()
}
// index: (job_id, occurred_at)
```

Events are **always written** regardless of any UI toggle. ~6 inserts per
artifact is negligible cost, and it means historical jobs stay inspectable.

### Event vocabulary

| `type`                    | When                                | Example `message`                                  |
|---------------------------|-------------------------------------|----------------------------------------------------|
| `job.started`             | Job row inserted (route handler)    | "Starting reading-material generation for 1 module" |
| `context.loaded`          | After `loadContext` step            | "Loaded course context (2,140 chars cacheable)"    |
| `artifact.calling_model`  | Right before each `callAnthropic`   | "Calling claude-sonnet-4-5 for module 'Intro to X'" |
| `artifact.model_responded`| After response (success)            | "Got 1,820 output tokens (300ms)"                  |
| `artifact.saved`          | After material row insert           | "Saved draft 'Intro to X — AI draft'"              |
| `artifact.failed`         | On per-artifact failure             | "Anthropic call failed: gateway-401"               |
| `job.finished`            | In `finalize` step                  | "1 succeeded, 0 failed"                            |

## API

Extend the existing job-detail endpoint instead of adding a new one:

- `GET /api/courses/:id/ai/jobs/:jobId` — response gains `events: AiJobEvent[]`,
  ordered by `occurred_at` asc.

Jobs are short-lived and event counts stay small (~6–10 per artifact), so we
ship the full array on each poll. YAGNI on cursor pagination until proven
needed.

## Server wiring (`materialGeneration.ts`)

A single helper:

```ts
async function recordEvent(
  db: Db,
  jobId: string,
  artifactId: string | null,
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
): Promise<void>
```

Called at the seven boundaries above. Each `recordEvent` is its own awaited
insert — **not** wrapped in `step.do(...)` — so any failure to write an event
cannot fail the parent step. The route handler in `courseAi.ts` writes
`job.started` when it inserts the job row.

## UI (`apps/web`, job detail view)

A collapsible **Activity** section beneath the existing status/totals card.

- Toggle: "Show realtime output". Defaults to **on** while the job is running
  and **off** when finished; the user's last manual choice is persisted to
  `localStorage` under `coursewise.ai.showAgentOutput`.
- Render `events` as a timeline. Each row: small colored dot (info=blue,
  warn=amber, error=red), `message`, relative timestamp, click-to-expand
  `metadata` as raw JSON in a `<pre>`.
- While the job is running, auto-scroll to the latest event. Pause auto-scroll
  if the user scrolls up manually (standard log-viewer behavior).
- Existing 2-second polling (`useCourseAiJob`) keeps events fresh — no new
  query hook needed.
