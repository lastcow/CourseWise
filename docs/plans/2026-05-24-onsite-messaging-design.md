# Onsite Messaging — Design

**Goal:** Let teachers/admins and enrolled students send each other onsite
(in-app) messages scoped to a course, with a Messages page for reading,
replying, and deleting, plus compose entry points on the Students,
Assignments, Quiz, and Alerts pages.

## Decided scope

- **Who can DM whom:** Teacher↔student **and** student↔student, but only
  between members of the same course. Teacher↔teacher within a course is
  also allowed (admins/co-teachers).
- **Inbox scope:** Per-course. Each course has its own Messages page;
  threads are tied to a course.
- **Notifications:** In-app only for V1 — unread badge in the top nav and
  per-thread unread markers. Email is deferred to V2.
- **Priority:** Each message carries one of `normal` (default) · `high` ·
  `urgent`. Picked from a dropdown in the compose dialog. Renders as a
  badge on the thread row and in the thread detail. Urgent threads sort
  to the top of the inbox.
- **Body format:** Markdown. Composed via the existing
  `<MarkdownEditor>`, rendered via `<MarkdownView>`. Body limit raised
  from 4000 → 8000 chars to allow richer content.
- **Realtime:** TanStack Query polling (15s on the messages page, 60s for
  the top-bar unread badge). No websockets/Durable Objects in V1.
- **Delete:** Per-user soft-delete at the thread level. A new message in
  the same thread un-hides it for the recipient.

## Data model

Two new tables in `apps/api/src/db/schema.ts`, with a new migration
following the `0014_course_deletion.sql` style.

### `message_threads`

```
id                     uuid pk
course_id              uuid not null  fk → courses(id) on delete cascade
participant_a_id       uuid not null  fk → users(id)   on delete cascade
participant_b_id       uuid not null  fk → users(id)   on delete cascade
subject                text not null            -- captured from first message
last_message_at        timestamptz not null
last_message_sender_id uuid             fk → users(id) on delete set null
deleted_by_a_at        timestamptz
deleted_by_b_at        timestamptz
created_at, updated_at timestamptz
```

- Pair is canonicalized: `participant_a_id < participant_b_id` (sorted by
  uuid text). Enforced by a check constraint.
- Multiple threads per pair per course are allowed (different subjects).
- Indexes:
  - `(course_id, participant_a_id, last_message_at desc)`
  - `(course_id, participant_b_id, last_message_at desc)`

### `messages`

```
id                       uuid pk
thread_id                uuid not null fk → message_threads(id) on delete cascade
sender_id                uuid not null fk → users(id)           on delete restrict
body                     text not null   -- 1..8000 chars, Markdown
priority                 text not null   -- 'normal' | 'high' | 'urgent'  default 'normal'
created_at               timestamptz not null
read_at_by_recipient     timestamptz
```

- Index on `(thread_id, created_at)`.
- Enum enforced by a check constraint:
  `priority IN ('normal','high','urgent')`.
- Thread-list responses also expose
  `highestUnreadPriority: 'normal' | 'high' | 'urgent' | null` so the
  inbox can highlight + sort urgent threads to the top without an extra
  round-trip.
- We rely on `message_threads.deleted_by_a_at / deleted_by_b_at` for
  per-user inbox hiding rather than per-message flags — simpler model.
- Recipient is derived: thread participants minus `sender_id`.

## API surface

All routes mounted in a new `apps/api/src/routes/messages.ts`, auth required.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/courses/:cid/messages` | Send a message. Body: `{ recipientId, body, threadId? subject? }`. If `threadId` is omitted, create a new thread (recipient + course-membership validated). |
| `GET`  | `/courses/:cid/messages/threads` | List my threads in this course. Returns `{ threadId, otherParticipant, subject, lastMessageAt, lastMessagePreview, unreadCount }[]`. Hides threads I soft-deleted unless a newer-than-deletedAt message exists. |
| `GET`  | `/courses/:cid/messages/threads/:tid` | Read a thread + its messages. Side effect: marks unread messages addressed to me as read. |
| `DELETE` | `/courses/:cid/messages/threads/:tid` | Soft-delete the thread for me. |
| `GET`  | `/messages/unread-count` | Total unread across all courses for the caller — drives the top-bar badge. |

Permission rules for every endpoint:
- Caller must be a course member (admin OR `isCourseTeacher` OR
  `isCourseEnrolled`).
- For thread-scoped endpoints, caller must be one of the two participants.
- For send: both sender and recipient must be course members of `:cid`.
  Sender = caller. Otherwise 403 with code `FORBIDDEN`.

Validation:
- `body` 1..8000 chars after trim; reject empty. Markdown text — stored
  raw, sanitized at render time by the existing `<MarkdownView>`.
- `subject` ≤ 200 chars.
- `priority` must be one of `normal` / `high` / `urgent`; defaults to
  `normal` if omitted.
- `recipientId !== senderId` (no self-DMs).

Audit:
- `recordAudit(action='message.send', target=threadId, metadata={ courseId, recipientId })`
- `recordAudit(action='message.thread.delete', target=threadId)`

## Frontend surfaces

### Shared component

`apps/web/src/components/messaging/MessageComposeDialog.tsx`

Props: `{ courseId, recipientId, recipientName, initialSubject?, initialPriority?, contextLine?, open, onClose }`.

Used by every entry point. Layout:

```
┌─────────────────────────────────────────────┐
│ Message <Recipient Name>                    │
├─────────────────────────────────────────────┤
│ Context: <optional muted line>              │
│                                             │
│ Subject:  [____________________________]    │
│ Priority: ( Normal v )    <-- dropdown      │
│                                             │
│ Body:                                       │
│ ┌─────────────────────────────────────────┐ │
│ │  <MarkdownEditor> (existing component)  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│             [Cancel]  [Send]                │
└─────────────────────────────────────────────┘
```

- Body field is the existing `<MarkdownEditor>` (same component used by
  reading materials, syllabus, etc.) so users get a familiar toolbar
  and preview.
- Priority dropdown renders the three levels with color hints
  (`normal` = subtle / `high` = amber / `urgent` = red).
- Send button is disabled while the mutation is pending or the body
  trims empty.

### Messages page

Route: `/teacher/courses/:cid/messages` and `/student/courses/:cid/messages`.

Layout (single file, role-agnostic component reused with role prop):

```
┌────────────────┬──────────────────────────────────────────┐
│ Threads list   │ Thread detail                            │
│ (search)       │  ┌─────────────────────────────────────┐ │
│ [thread row]   │  │ <other> · subject                   │ │
│   bold = unread│  │ messages in chronological order     │ │
│   delete icon  │  └─────────────────────────────────────┘ │
│                │  [reply textarea + send]                  │
└────────────────┴──────────────────────────────────────────┘
```

- New conversation button at the top of the threads pane.
- Polls thread list every 15s while page is mounted (TanStack Query
  `refetchInterval`).
- Reading a thread marks-as-read via the GET side effect.

### Top-bar unread badge

`apps/web/src/components/BackOfficeLayout.tsx` — add a `<MessageBell>`
next to the existing user menu. Polls `/api/messages/unread-count` every
60s. Clicking jumps to the messages page of the currently-active course
(if the user is inside one) or to a course-picker prompt.

### Compose entry points

| Page | Trigger | Recipient | Context line |
|---|---|---|---|
| Teacher Students page (`TeacherStudentsPage`) | `MessageSquare` icon in each enrolled row's actions column | the row's student | none |
| Student Students page (`StudentStudentsPage`) | `MessageSquare` icon on each row (any course member) | the row's user | none |
| Teacher Assignments page (`TeacherAssignmentsPage`) | "Message student" on submission row | submission's student | "About: Assignment <title>" |
| Teacher Quizzes page (`TeacherQuizzesPage`) | "Message student" on attempt row | attempt's student | "About: Quiz <title>" |
| Teacher Alerts page (`TeacherAlertsPage`) | "Message student" on alerts that reference a student | alert's student | "About: <alert summary>" |

Each trigger opens the shared `MessageComposeDialog` pre-populated.

## i18n

New keys under `messages.*` (en + zh-CN): `title`, `composeCta`,
`replyPlaceholder`, `subjectLabel`, `bodyLabel`, `send`, `delete`,
`unread`, `noThreads`, `searchPlaceholder`, `priorityLabel`,
`priorityNormal`, `priorityHigh`, `priorityUrgent`, etc. Plus
`topnav.messages` and `topnav.unreadCountBadge`.

## Privacy / FERPA notes

- Messages stay in the course context. When a course is hard-deleted, the
  cascade on `course_id` removes its threads and messages (matches
  existing FERPA delete behavior).
- Admins are not given special read access to other people's threads in
  V1. If compliance review later mandates it, we add an admin-only audit
  endpoint that records every access.

## Out of scope (V2+)

- Attachments / file uploads on messages.
- Email or push notifications.
- Group messages / channels.
- Reactions, edits, message-level deletes.
- Read receipts shown to the sender (V1 only tracks read state for
  unread counts, not "Seen at 4:21pm" UI).
- Course-level toggle to disable peer DMs.
