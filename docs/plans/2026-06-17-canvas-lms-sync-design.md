# Canvas LMS two-way sync — design

> **Superseded (2026-07-04).** Replaced by
> [2026-07-04-canvas-sync-v2-import-first-design.md](2026-07-04-canvas-sync-v2-import-first-design.md)
> (import-first, teacher personal-access-token auth, identity linking) and
> [2026-07-04-canvas-sync-v3-bidirectional-design.md](2026-07-04-canvas-sync-v3-bidirectional-design.md)
> (full bidirectional content sync built on v2). Kept for history; do not implement from this doc.

## Goal

Let a teacher connect a course to a **Canvas LMS** course and keep the two in
step in **both directions** — roster/enrollments, the gradebook (assignment
groups, assignments, submission scores), student groups, and (one-way)
attendance. Because the data is high-stakes (FERPA grades, drops), sync is never
silent: every proposed change is staged and shown in a **review screen** where
the teacher approves/rejects each item and resolves conflicts by hand before
anything is written. Students are matched across the two systems by
`student_number` ↔ Canvas `sis_user_id`, with email as a fallback and a manual
link for the rest.

## Why

There is no LMS bridge today. Teachers who run their course in Canvas re-key the
roster into CourseWise and re-key grades back into Canvas by hand. CourseWise
already owns the data model for everything Canvas exposes (users, courses,
enrollments, assignment groups, assignments, submissions, groups) on stable
natural keys — `student_profiles.student_number` (unique), `courses.code`
(unique) — so the mapping is mechanical. What's missing is (1) a Canvas API
client, (2) an ID-mapping layer, and (3) a staged, reviewable apply pipeline so
a bad sync can't quietly overwrite grades.

## Decided scope

Confirmed with the requester (2026-06-17):

- **Scope — everything.** Roster/enrollments, grades (submission scores + a
  computed-final column), gradebook structure (assignment groups + assignments),
  student groups, and attendance (export-only — Canvas has no attendance API).
- **Conflict model — manual review on every conflict.** Sync is a three-stage
  **plan → review → apply** pipeline. Plan and review touch no real data; only
  *approved* changes are applied. A change where both sides moved since the last
  sync is a `conflict` and cannot be applied until the teacher picks a side.
- **Student matching — `student_number` ↔ `sis_user_id`, email fallback,
  manual link.** Auto-match by SIS id, then by lower(email) ↔ login_id/email,
  then surface the rest as `unmatched` for a one-time manual link that is
  remembered in `canvas_id_map`.
- **Token — per-teacher, reused across that teacher's courses.** Each teacher
  stores one Canvas access token; it is encrypted at rest and reused for every
  course they own.

In:

- New tables: `canvas_connections`, `canvas_course_links`, `canvas_id_map`,
  `canvas_sync_runs`, `canvas_sync_changes` (migration 0043).
- A `CanvasClient` service (fetch-based, Link-header pagination, leaky-bucket
  backoff) mirroring `services/gamma/client.ts`.
- Plan and apply as Cloudflare Workflows (mirroring `workflows/courseExport.ts`);
  an optional cron that only ever plans (never applies).
- Teacher routes for connection, course link, plan, review (read + decide), and
  apply; a settings page and a review screen on `apps/web`; tri-file i18n.
- AES-GCM token encryption helper added to `lib/crypto.ts`.

Out:

- OAuth2 authorization-code flow (manual access token only, this round).
- Auto-apply / fully-unattended sync — apply is always teacher-initiated.
- Writing a real Canvas **final course grade** (no standard REST endpoint;
  Final Grade Override is GraphQL + a feature flag). We push the CourseWise
  computed final into a dedicated Canvas assignment column instead.
- Native Canvas attendance (Roll Call is a private LTI) — attendance is
  export-only or mirrored as an assignment column.
- Syncing content (modules, pages, files, quizzes, discussions, rubrics).
- Multi-tenant / institution admin token management.

## Architecture

The pipeline is the spine of the design. Everything else (client, schema, UI)
exists to serve it:

```
  PLAN (read-only)            REVIEW (read-only)         APPLY (writes)
  fetch both sides   ──▶      teacher approves/   ──▶    execute approved
  three-way diff             rejects each change,        changes per-direction,
  emit sync_changes          resolves conflicts          record per-row result
  (Workflow)                 (review screen)             (Workflow, idempotent)
```

Plan is idempotent and re-runnable; apply only ever touches rows the teacher
approved. This is what satisfies "make sure data doesn't sync wrong."

### Auth & connection — token at rest

Reuse the repo's **secret-name-reference** principle (`aiProviders.apiKeySecretRef`,
`schema.ts:1333` — "the secret value itself never lives in the DB") but adapt it:
per-teacher token count is unbounded, so `wrangler secret put` per teacher is not
viable. Instead, **encrypt the token in the DB** with a single Worker secret as
the key.

- New Worker secret `CANVAS_TOKEN_ENC_KEY` (32-byte base64), added to
  `AppBindings` (`apps/api/src/types.ts`) and `.env.example`.
- New helpers in `apps/api/src/lib/crypto.ts` (today only `sha256Hex`,
  `randomBase62`, `randomUuid`): `encryptSecret(plaintext, key)` /
  `decryptSecret(ciphertext, key)` using WebCrypto **AES-GCM** (random 12-byte
  IV prepended; store `base64(iv || ciphertext)`).
- `canvas_connections.access_token_ciphertext` holds the encrypted token. The
  plaintext is decrypted only in-memory at call time, never logged, never
  returned (API responses show `••••<last4>` + Canvas `base_url` + the verified
  Canvas user name).
- On connect, verify the token by calling `GET /api/v1/users/self` before saving;
  401/403 → `CANVAS_AUTH_ERROR`.

### Student ID mapping

Persisted in one cross-entity table so every entity resolves IDs the same way:

```ts
// canvas_id_map (schema.ts + migration 0043)
{
  id: uuid pk,
  courseId: uuid,                 // mapping is scoped to a course context
  entityType: text,              // 'user'|'course'|'enrollment'|'assignment'
                                 //  |'assignment_group'|'group_set'|'group'|'submission'
  coursewiseId: uuid,            // CourseWise UUID
  canvasId: text,                // Canvas numeric id stored as text (precision)
  matchMethod: text,             // 'sis_user_id'|'email'|'code'|'manual'
  lastSyncedFingerprint: text,   // sha256Hex of the last agreed snapshot (see diff)
  lastSyncedAt: timestamptz,
  // unique(courseId, entityType, coursewiseId), unique(courseId, entityType, canvasId)
}
```

Student match order during plan: (1) `student_profiles.student_number` ===
Canvas `sis_user_id`; (2) `lower(users.email)` === Canvas `login_id` or `email`;
(3) otherwise emit an `unmatched` change. A manual link in the review screen
writes a `matchMethod:'manual'` row that is honored on every future run. Courses
map `courses.code` ↔ `sis_course_id`.

> ⚠️ **Permission caveat that drives the fallback.** Canvas only exposes
> `user.sis_user_id` to callers with "read SIS data" permission — typically
> admins, **not** teachers. With a per-teacher token, expect `sis_user_id` to come
> back `null`, so in practice **email/login_id is the working primary key** and
> the manual-link step clears the remainder. This must be surfaced in the connect
> UI ("ask your Canvas admin to grant teachers read-SIS to auto-match by student
> number") and is the single biggest first-run friction. See Risks.

### Data model — `apps/api/src/db/schema.ts` (+ migration 0043)

Five tables (idempotent SQL, `DO $$ … $$` FKs, mirroring `drizzle/0024_messaging.sql`):

- **`canvas_connections`** — `id`, `teacherId` (unique FK → users), `canvasBaseUrl`,
  `accessTokenCiphertext`, `canvasUserName`, `status` (`active`/`revoked`),
  timestamps. One per teacher.
- **`canvas_course_links`** — `id`, `courseId` (FK), `connectionId` (FK),
  `canvasCourseId` (text), `enabledEntities` (jsonb: which entity types sync),
  `status`, timestamps. Unique `(courseId)`.
- **`canvas_id_map`** — as above.
- **`canvas_sync_runs`** — `id`, `courseId`, `triggeredById`, `status`
  (`planning`/`review`/`applying`/`done`/`failed`), `counts` (jsonb:
  create/update/conflict/unmatched/applied/failed), `plannedAt`, `appliedAt`,
  `expiresAt` (plan TTL). A **partial unique index** enforces at most one
  *in-progress* run per course (`WHERE status IN ('planning','review','applying')`).
- **`canvas_sync_changes`** — the review screen's data source:
  `id`, `runId` (FK, cascade), `entityType`, `direction` (`to_canvas`/`to_cw`),
  `op` (`create`/`update`/`delete`/`conflict`/`unmatched`), `coursewiseId`,
  `canvasId`, `label` (human row title), `fieldDiffs` (jsonb
  `[{field, base, cw, canvas}]`), `decision`
  (`pending`/`approved`/`rejected`/`manual_link`), `resolvedSide`
  (`cw`/`canvas`/null for conflicts), `resolvedCanvasId` (manual link),
  `applyStatus` (`pending`/`applied`/`failed`/`skipped`), `applyError`.

### Three-way diff — conflict detection

`canvas_id_map.lastSyncedFingerprint` stores `sha256Hex` of the normalized,
agreed field-set captured after the last successful apply. At plan time, for each
mapped entity:

```
cwChanged     = sha256Hex(normalize(cwFields))     !== lastSyncedFingerprint
canvasChanged = sha256Hex(normalize(canvasFields)) !== lastSyncedFingerprint
```

- one side changed → single-direction `update` (primary direction; still needs
  approval),
- **both changed → `conflict`** carrying `base/cw/canvas` per field; the teacher
  must pick `resolvedSide` before it is applicable,
- present one side only → `create`/`delete` per primary direction,
- no map row → `unmatched` (manual link).

This makes "who moved since last sync" decidable, which is what makes two-way
safe rather than last-write-wins.

### Per-entity mapping & primary direction

`/api/v1` prefix omitted. Primary direction is the no-conflict default; conflicts
always go to review.

| Entity | CourseWise | Canvas object / endpoint | Primary dir |
|---|---|---|---|
| Course link | `courses.code` | `GET courses/sis_course_id:<code>` or numeric id | manual bind |
| Enrollments | `enrollments.status` | `courses/:id/enrollments` (`type[]=StudentEnrollment`, `state[]=active,completed,inactive`) | Canvas → CW |
| Student fill | `users`, `student_profiles` | `courses/:id/users?include[]=enrollments,email` | Canvas → CW (read-only) |
| Assignment groups | `assignment_groups.weight` | `assignment_groups?include[]=assignments` | two-way |
| Assignments | `assignments` (title/due/maxScore) | `POST/PUT courses/:id/assignments` (`points_possible`, `due_at`, `assignment_group_id`, `published`) | CW → Canvas |
| Submission scores | `assignment_submissions.score` | `PUT …/submissions/:user_id` `submission[posted_grade]`; bulk `POST …/submissions/update_grades` → Progress (poll `GET progress/:id`) | CW → Canvas |
| Final grade | `final_grades.score`/`letterGrade` | dedicated "CourseWise Final Grade" assignment column | CW → Canvas (optional) |
| Groups | `group_sets`/`groups`/`group_memberships` | `group_categories` → `groups` → `groups/:id/memberships` (match by name) | two-way |
| Attendance | `attendance_*` | none (no API) | export-only |

Two grade specifics: submission scores are the clean path (per-assignment
`posted_grade`, bulk via the async `update_grades` Progress object); the
**course final** has no standard REST writer, so we push CourseWise's
compute-on-read final (`services/finalGrade.ts`) into a dedicated Canvas
assignment column rather than fighting Final Grade Override. Attendance has no
Canvas API at all — export CSV or mirror attendance rate into an assignment
column, never two-way.

### Canvas client — `apps/api/src/services/canvas/client.ts`

Clone the `gamma/client.ts` shape (fetch + `ApiException` mapping) and add the
three Canvas-specific concerns:

- **Auth**: `Authorization: Bearer <token>`.
- **Pagination**: parse the RFC-5988 `Link` header `rel="next"` and follow it;
  `per_page=100`. Wrap in `listAll<T>(path)`.
- **Throttling**: Canvas is a leaky bucket — read `X-Rate-Limit-Remaining` /
  `X-Request-Cost`; an exhausted bucket returns **403 "Rate Limit Exceeded"**.
  Cap outbound concurrency (~4), pre-throttle when remaining is low, and
  exponential-backoff on 403/429. Reuse `KvRateLimiter` (`services/rateLimit.ts`)
  keyed by connection to coordinate across requests.
- **Error mapping**: 401/403 → `CANVAS_AUTH_ERROR`; 5xx → 502 upstream; others →
  `CANVAS_SYNC_ERROR`. New codes in `lib/errors.ts` with `errors.canvas*`
  i18nKeys (`CANVAS_AUTH_ERROR`, `CANVAS_LINK_NOT_FOUND`,
  `CANVAS_CONFLICT_UNRESOLVED`, `CANVAS_RATE_LIMITED`).

Methods: `getSelf`, `getCourse`, `listEnrollments`, `listUsers`,
`listAssignmentGroups`, `listAssignments`, `createAssignment`, `updateAssignment`,
`bulkUpdateGrades`, `getProgress`, `listGroupCategories`, `createGroup`,
`addGroupMembership`.

### Background execution

- **Plan** and **apply** run as Cloudflare Workflows (mirroring
  `workflows/courseExport.ts`): plan steps = fetch-canvas → fetch-cw → diff →
  persist `canvas_sync_changes`; apply steps iterate approved changes with
  step-level retry and idempotency (skip rows already `applied`), writing
  `applyStatus`/`applyError` per row. Bulk grades go through `update_grades` then
  poll the Progress object.
- **Triggers**: teacher-initiated plan (returns `runId`); an optional cron
  (extra entry in `wrangler.toml [triggers]`) that **only plans to `review`** and
  alerts the teacher — it never applies.
- The in-progress-run partial unique index serializes runs per course.

### API — `apps/api/src/routes/canvas.ts`

Stack: `requireAuth → requireScopeGroup → requireCourseTeacher`.

```
POST   /api/teacher/canvas/connection                  connect/update token (verify, encrypt, save)
DELETE /api/teacher/canvas/connection                  disconnect
GET    /api/courses/:courseId/canvas/link              link status
POST   /api/courses/:courseId/canvas/link              bind Canvas course (by code or numeric id)
POST   /api/courses/:courseId/canvas/sync/plan         start a plan → { runId }
GET    /api/courses/:courseId/canvas/sync/:runId       run status + paged changes (review source)
PATCH  /api/courses/:courseId/canvas/sync/:runId/changes  bulk decision / manual link / conflict resolve
POST   /api/courses/:courseId/canvas/sync/:runId/apply    apply approved changes (rejects if any pending conflict)
```

Every connect/link/apply and every manual link writes an `audit_logs` row
(`action: canvas.sync.*`); grade-bearing rows set `disclosed_student_id` for
FERPA, matching existing audit usage. Register routes in `index.ts` and
`lib/openapi.ts`.

### UI — `apps/web`

- **Settings**: `/teacher/settings/canvas` — paste token + base URL, live status
  via `GET /users/self`, show `••••<last4>` + Canvas user name, disconnect.
- **Course entry**: a "Canvas Sync" item in the course nav — bind card + a
  "Generate plan" button that routes to the review screen.
- **Review screen** (`/teacher/courses/:courseId/canvas/sync/:runId`) — the core:
  - header counts badge (`create N · update N · conflict N · unmatched N · pending N`),
    filters by entity + direction, expand/collapse all;
  - body grouped by entity type, each row a change with a direction arrow, op tag,
    object label, and **field-level diff** (old → new, changed fields highlighted);
    **conflict rows** show base / CourseWise / Canvas side-by-side with a required
    "use CourseWise / use Canvas / skip" choice;
  - per-row and per-group approve/reject; a global approve that **excludes
    conflicts** (they must be resolved individually — hard guard);
  - `unmatched` student rows get a dropdown to manually link an unmatched Canvas
    user; linking writes `canvas_id_map`;
  - sticky footer with `approved X / Y` + **Apply** (disabled while any conflict
    is `pending`); Apply shows the shared blocking `LoadingDialog`
    (`components/ui/loading-dialog.tsx`), consistent with the attendance/grades pages.
  - Guards: bulk-delete over a threshold needs a red second confirm; the plan has
    a TTL (`expiresAt`) — an expired plan must be regenerated before Apply so we
    never write against a stale snapshot.
- **Hooks** in `lib/queries.ts`: `useCanvasConnection`, `useCanvasLink`,
  `useCanvasPlan`, `useCanvasRun`, `useUpdateCanvasChanges`, `useApplyCanvasRun`.
- **i18n**: a `canvas.*` block (connection, status, op/direction labels, diff
  labels, conflict + guard copy) added identically to `locales/{en,zh-CN,fr}.ts`.

## Milestones

Each is an independently shippable PR sequence.

1. **M1 — connect + read-only plan (roster).** Token connect (encrypt + verify),
   course link, `canvas_id_map`, plan emits roster diff, review renders read-only.
2. **M2 — review decisions + apply (roster/enrollments).** Approve/reject, manual
   link, apply writes CourseWise. Validates idempotency + audit.
3. **M3 — gradebook structure + assignments + submission scores** (CW → Canvas,
   async `update_grades` Progress polling).
4. **M4 — groups two-way + full three-way conflict path.**
5. **M5 — final-grade column + attendance export + scheduled plan-only cron.**

## Testing

- `canvas.permissions.test.ts` (no DB) — 401 unauthenticated on all routes; 403
  for non-teacher of the course; apply rejects when conflicts are `pending`.
- `canvasClient.test.ts` — Link-header pagination follows `next`; 403 "Rate Limit
  Exceeded" triggers backoff; error-code mapping (401/403/5xx).
- `canvasDiff.test.ts` (pure) — three-way diff: one-side-changed → directional
  `update`; both-changed → `conflict` with base/cw/canvas; no map row →
  `unmatched`; fingerprint equality suppresses no-op changes.
- `canvas.integration.test.ts` (`skipIf(!DATABASE_URL)`) — plan persists changes;
  PATCH decisions; manual link writes `canvas_id_map` and is reused next plan;
  apply writes only approved rows, records per-row `applyStatus`, and re-running
  apply is idempotent; the in-progress partial unique index blocks a second run.
- Manual smoke against a Canvas test/beta instance: connect a teacher token, bind
  a course, plan → confirm unmatched students resolve via manual link, approve a
  grade push, apply, verify the score in the Canvas gradebook, re-plan → clean.

## Risks and trade-offs

- **Teacher tokens can't read `sis_user_id`.** The headline matching key is
  usually invisible to teacher tokens, so email/login_id carries the auto-match
  and the manual-link step clears the rest. Mitigation: lead with email matching,
  remember manual links, and tell the teacher to request read-SIS for true
  student-number matching. Confirm with the institution's Canvas admin before M1.
- **No REST writer for the course final grade.** We push the computed final to a
  dedicated assignment column instead of Final Grade Override (GraphQL +
  feature-flag), trading "real final" fidelity for a standard, durable REST path.
- **Attendance is one-way.** No Canvas attendance API; export-only or an
  assignment-column mirror, clearly labeled in the UI.
- **Token at rest.** We encrypt (AES-GCM) rather than reference a Worker secret
  because per-teacher tokens are unbounded; the trade is that decryption depends
  on `CANVAS_TOKEN_ENC_KEY` (rotateable, but key loss invalidates all stored
  tokens — they'd be re-pasted).
- **Stale-plan applies.** Plan TTL + a fingerprint re-check at apply time guard
  against writing decisions made against data that has since moved.
- **Canvas rate limits.** Aggressive sync can 403 a teacher's whole token;
  concurrency cap + backoff + KV coordination keep us under the bucket.
- **Numeric id precision.** Canvas ids are large integers; stored as text in
  `canvas_id_map` to avoid JS number precision loss.
