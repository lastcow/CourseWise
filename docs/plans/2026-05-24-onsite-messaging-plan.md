# Onsite Messaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Build a per-course in-app messaging system: teacher↔student and
student↔student, with a Messages page (read/reply/delete) and compose
entry points on Students, Assignments, Quiz, and Alerts pages. Top-bar
unread badge powered by polling.

**Architecture:** Two new Postgres tables (`message_threads`,
`messages`), Hono routes under `apps/api/src/routes/messages.ts`, shared
types in `packages/shared`, and a small React UI: shared
`MessageComposeDialog`, a Messages page (list+detail), and a top-bar
badge. TanStack Query for state; no websockets.

**Tech Stack:** Hono · Drizzle ORM · Neon Postgres (HTTP driver) ·
Cloudflare Workers · React · Vite · TanStack Query · Tailwind · i18next.

See companion design: `docs/plans/2026-05-24-onsite-messaging-design.md`.

---

## Task 1 — DB migration and schema

**Files:**
- Create: `apps/api/drizzle/0028_messaging.sql`
- Modify: `apps/api/src/db/schema.ts`

**Step 1: Write migration** (mirror `0014_course_deletion.sql` idempotent
DO-block pattern). Tables, indexes, FK actions, check constraints:
- `participant_a_id < participant_b_id` on `message_threads`
- `priority IN ('normal','high','urgent')` on `messages`
- `messages.priority` is `text not null default 'normal'`
- `messages.body` text not null (no length cap at DB layer; API caps at 8000)

**Step 2: Add Drizzle schema entries**
`messageThreads` and `messages` matching the SQL. Export both.

**Step 3: Apply locally**
Run: `pnpm --filter @coursewise/api db:migrate`
Expected: migration applied, idempotent rerun is a no-op.

**Step 4: Commit**

---

## Task 2 — Shared types

**Files:**
- Modify: `packages/shared/src/types.ts`

Add:
- `MessagePriority = 'normal' | 'high' | 'urgent'`
- `MESSAGE_PRIORITIES: readonly MessagePriority[]` const tuple (for
  zod enum + UI dropdown reuse)
- `MessageThreadSummary` — includes `highestUnreadPriority: MessagePriority | null`
- `MessageRecord` — includes `priority: MessagePriority` and `body: string` (markdown)
- `SendMessageInput { recipientId; threadId?; subject?; body; priority?: MessagePriority }`
- `UnreadCountResponse { total: number }`

Wire into `packages/shared/src/index.ts` if it re-exports types
explicitly.

Run: `pnpm --filter @coursewise/shared build`

Commit.

---

## Task 3 — API: send message

**Files:**
- Create: `apps/api/src/routes/messages.ts`
- Modify: `apps/api/src/index.ts` (mount route)
- Modify: `apps/api/src/lib/openapi.ts` (document endpoints)

Route: `POST /api/courses/:cid/messages`.

Body schema (zod):
```ts
z.object({
  recipientId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(8000),
  priority: z.enum(MESSAGE_PRIORITIES).default('normal'),
})
```

Logic:
1. Auth required; verify caller is course member (admin OR teacher OR
   student) via existing `services/courseAccess`.
2. Validate `recipientId` is also a course member; reject self-DM.
3. If `threadId` provided: assert caller is a participant; append.
4. Else: canonicalize `(participantA, participantB) = sort([caller, recipientId])`,
   create thread (using `subject` or a fallback derived from the body's
   first line), then insert message.
5. Insert message with `priority` (default `'normal'`).
6. Update `thread.last_message_at = now()`,
   `last_message_sender_id = caller`, and `deleted_by_{a,b}_at = null`
   for the recipient so a hidden thread reappears.
7. Audit log includes `priority` in metadata.

**Tests:** add `apps/api/src/routes/messages.permissions.test.ts`:
- non-member 403
- recipient not a course member → 403
- self-DM → 400
- invalid priority value → 400
- happy path with `priority='urgent'` returns 201 and the new message
  with `priority` echoed back

Run: `pnpm --filter @coursewise/api test`

Commit.

---

## Task 4 — API: list threads + unread count

**Files:**
- Modify: `apps/api/src/routes/messages.ts`

Routes:
- `GET /api/courses/:cid/messages/threads` — returns my threads in this
  course (excluding ones I've soft-deleted unless there's a message
  newer than my `deleted_by_X_at`). Each row: `threadId`,
  `otherParticipant {id,name,email}`, `subject`, `lastMessageAt`,
  `lastMessagePreview` (first 140 chars of body, with markdown
  syntax stripped via the existing `stripMarkdown` helper at render
  time on the client — server returns raw), `unreadCount`,
  `highestUnreadPriority`.
  Sort: rows whose `highestUnreadPriority='urgent'` first, then by
  `lastMessageAt DESC`.
- `GET /api/messages/unread-count` — across all my courses, sum of
  unread messages addressed to me. Used by the topbar.

Notes:
- Use one SELECT with subqueries to compute `unreadCount` per thread
  (count of messages where `sender_id != me AND read_at_by_recipient
  IS NULL`).
- "Other participant" name/email require a join against `users`.

Commit.

---

## Task 5 — API: read thread + mark-as-read

**Files:**
- Modify: `apps/api/src/routes/messages.ts`

Route: `GET /api/courses/:cid/messages/threads/:tid` — returns the
thread metadata + its messages in chronological order. Side effect:
mark all messages where `sender_id != me AND read_at_by_recipient IS
NULL` as read in a single UPDATE.

Use a CTE since the Neon HTTP driver has no transactions:

```sql
WITH updated AS (
  UPDATE messages SET read_at_by_recipient = now()
  WHERE thread_id = $1 AND sender_id != $2 AND read_at_by_recipient IS NULL
  RETURNING id
)
SELECT ... FROM messages WHERE thread_id = $1 ORDER BY created_at
```

Permission: caller must be one of `participant_a_id` /
`participant_b_id`.

Commit.

---

## Task 6 — API: soft-delete thread

**Files:**
- Modify: `apps/api/src/routes/messages.ts`

Route: `DELETE /api/courses/:cid/messages/threads/:tid` — sets
`deleted_by_a_at` or `deleted_by_b_at` to `now()` depending on which
side the caller is. Returns 204.

Commit.

---

## Task 7 — Web: query layer

**Files:**
- Modify: `apps/web/src/lib/queries.ts`
- Modify: `apps/web/src/lib/api.ts` (no change expected; `apiCall` reused)

Add hooks:
- `useMessageThreads(courseId, { enabled })` with `refetchInterval: 15_000`
- `useMessageThread(courseId, threadId)` — fetches detail; invalidates on
  send/delete
- `useSendMessage(courseId)`
- `useDeleteMessageThread(courseId)`
- `useUnreadCount()` with `refetchInterval: 60_000`

Invalidation: on send / delete, invalidate
`['messages','threads',courseId]` and `['messages','unread-count']`.

Commit.

---

## Task 8 — Web: shared compose dialog

**Files:**
- Create: `apps/web/src/components/messaging/MessageComposeDialog.tsx`

Props: `{ courseId, recipientId, recipientName, initialSubject?, initialPriority?, contextLine?, open, onClose }`.

Uses existing `Dialog`, `Input`, `MarkdownEditor`, `Button`. Pre-fill
subject from `initialSubject` (editable). Render `contextLine` above the
body field. Body field is the existing `<MarkdownEditor>`. Priority is
a labelled `<select>` populated from `MESSAGE_PRIORITIES` with three
options:
- Normal (`text-muted-foreground`)
- High (`text-amber-600`)
- Urgent (`text-red-600`)

Disabled state while `useSendMessage` is pending OR body trims empty.
Toast on success / failure. On success, dialog closes and the messages
query for this course is invalidated so a new thread shows up
immediately.

Commit.

---

## Task 9 — Web: Messages page

**Files:**
- Create: `apps/web/src/pages/messaging/MessagesPage.tsx` (role-agnostic)
- Modify: `apps/web/src/App.tsx` to register routes
  - `/teacher/courses/:cid/messages` → `<MessagesPage />`
  - `/student/courses/:cid/messages` → `<MessagesPage />`
- Modify: `apps/web/src/components/SideNav.tsx` — add Messages menu item
  below Students for both roles, hidden when not inside a course.

Layout: left pane = thread list (search field on top, each row clickable,
shows otherParticipant.name, subject, lastMessagePreview, unread badge,
priority badge when `highestUnreadPriority !== 'normal'`, delete icon).
Right pane = selected thread (header, scrollable messages rendered with
`<MarkdownView>`, per-message priority badge when not normal, reply
composer at the bottom which is a compact `<MarkdownEditor>` + priority
dropdown + send button).

Empty states: `messages.noThreads`, `messages.noSelection`.

Commit.

---

## Task 10 — Web: top-bar unread badge

**Files:**
- Modify: `apps/web/src/components/BackOfficeLayout.tsx`
- Create: `apps/web/src/components/messaging/MessageBell.tsx`

`MessageBell` polls `useUnreadCount`; renders an envelope icon with a
small numeric badge when > 0. Click navigates to the messages page of
the currently-active course (read from `useParams` / pathname); if not
inside a course, fall back to `/teacher/courses` or `/student/courses`
landing.

Commit.

---

## Task 11 — Web: wire compose entry points

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherStudentsPage.tsx`
- Modify: `apps/web/src/pages/student/StudentStudentsPage.tsx`
- Modify: `apps/web/src/pages/teacher/TeacherAssignmentsPage.tsx`
- Modify: `apps/web/src/pages/teacher/TeacherQuizzesPage.tsx`
  (or the per-quiz attempts page where student rows live)
- Modify: `apps/web/src/pages/teacher/TeacherAlertsPage.tsx`
  (only on alerts that reference a specific student)

### Students pages — explicit requirement

For both `TeacherStudentsPage` and `StudentStudentsPage`:

- Add a new `MessageSquare` `ActionIconButton` (color `sky`) to every
  enrolled row in the flat roster table. Teacher page already has an
  actions column; student page needs an actions cell added.
- Clicking opens the shared `MessageComposeDialog` with
  `recipientId = row.studentId`, `recipientName = row.studentName`, no
  `initialSubject`, no `contextLine`.
- Hook state lives at the page level: `const [composeTo, setComposeTo] = useState<EnrollmentRow | null>(null);`
- For the student page, the action shows for every row regardless of
  whether the row is a peer or a teacher — both are allowed per the
  scope decision.

### Other pages

In each, import `MessageComposeDialog`, add a `MessageSquare`
`ActionIconButton` on the relevant row, hold composer state, pass
`recipientId`, `recipientName`, and the appropriate `contextLine`
(e.g. "About: Assignment <title>").

Commit each page separately for clean diffs.

---

## Task 12 — i18n

**Files:**
- Modify: `apps/web/src/locales/en.ts`
- Modify: `apps/web/src/locales/zh-CN.ts`

Add `messages.*` keys (see design doc) and `topnav.messages`. Must
include `priorityLabel`, `priorityNormal`, `priorityHigh`,
`priorityUrgent`, and a per-row helper string `urgentBanner` shown above
urgent threads in the inbox.

Commit.

---

## Task 13 — Integration test

**Files:**
- Create: `apps/api/src/routes/messages.integration.test.ts`

Scenarios:
1. Teacher A sends to student B (same course) — happy path.
2. Student B replies → thread is updated; teacher A sees unread = 1
   until they GET the thread.
3. Student C (not enrolled) attempting to send to student B in course
   X → 403.
4. Soft-delete by recipient hides the thread from their list; a new
   inbound message un-hides it.
5. Self-DM → 400.

Run: `pnpm --filter @coursewise/api test`.

Commit.

---

## Final review + ship

After Task 13:
1. `pnpm --filter @coursewise/api typecheck && pnpm --filter @coursewise/web typecheck`
2. `pnpm --filter @coursewise/api test && pnpm --filter @coursewise/web test`
3. Spin up dev server, exercise: send from each entry point, reply on
   both sides, soft-delete on both sides, unread badge updates.
4. Standard PR workflow: one PR per Task or a single bundled PR — defer
   to user preference. (User has previously preferred per-feature
   bundled PRs in this codebase.)
