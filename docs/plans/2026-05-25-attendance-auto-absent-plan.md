# Auto-mark Absent on Sign-in Cutoff — Implementation Plan

> Companion to `2026-05-25-attendance-auto-absent-design.md`.

**Goal:** Materialize an `absent` row in `attendance_records` for every
enrolled student who hasn't signed in by
`sessionDate + absentAfterMinutes`. Cron drives the bulk path; a lazy
backstop in the teacher's records GET catches any session a teacher
opens before the next cron tick.

---

## Task 1 — Service: `attendanceAutoAbsent.ts`

**Files:**
- Create: `apps/api/src/services/attendanceAutoAbsent.ts`

Export two functions:

```ts
export async function runAutoAbsentForSession(
  db: Db,
  sessionId: string,
): Promise<{ inserted: number }>;

export async function runAutoAbsentSweep(
  db: Db,
): Promise<{ sessionsScanned: number; recordsInserted: number }>;
```

`runAutoAbsentForSession` runs the one-session insert via a single
`INSERT INTO attendance_records (…) SELECT … FROM enrollments e WHERE
e.course_id = $cid AND e.status='enrolled' AND NOT EXISTS (SELECT 1
FROM attendance_records ar WHERE ar.session_id = $sid AND ar.student_id =
e.student_id) ON CONFLICT (session_id, student_id) DO NOTHING RETURNING
id`. It does NOT itself check the cutoff — callers pass only eligible
sessions. (The teacher-GET path will pre-check the cutoff before calling
this to avoid an empty INSERT for sessions still inside the grace
window.)

`runAutoAbsentSweep` selects eligible sessions per the design's WHERE
clause, calls `runAutoAbsentForSession` for each, and writes a
`recordAudit('attendance.auto_absent', target=sessionId,
metadata={inserted})` row per session that actually inserted at least
one record. Bounded by `session_date >= now() - interval '14 days'`.

Unit-test the SQL parameter shape with vitest in
`attendanceAutoAbsent.test.ts` (mocked db).

Commit.

---

## Task 2 — Lazy backstop in the records GET

**Files:**
- Modify: `apps/api/src/routes/attendance.ts`

Find the records-list endpoint (`GET .../sessions/:sessionId/records`).
Before the existing SELECT, evaluate eligibility for this one session:

```ts
const cutoffPassed =
  session.status === 'open' &&
  session.absentAfterMinutes != null &&
  Date.now() >=
    Date.parse(session.sessionDate) + session.absentAfterMinutes * 60_000;

if (cutoffPassed) {
  try {
    await runAutoAbsentForSession(db, sessionId);
  } catch (err) {
    console.error('attendance.autoAbsent.inline.failed', { sessionId, err });
  }
}
```

The unique index makes the insert idempotent, so concurrent reads can
race without doubling rows. Errors are logged but don't fail the read.

Commit.

---

## Task 3 — Cron handler wiring

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/wrangler.toml`

Add a second cron schedule and dispatch in the `scheduled` handler:

```toml
[triggers]
crons = ["0 4 * * *", "*/5 * * * *"]
```

```ts
async scheduled(controller, env, ctx) {
  if (controller.cron === '0 4 * * *') {
    /* existing retention sweep */
  } else if (controller.cron === '*/5 * * * *') {
    ctx.waitUntil(
      runAutoAbsentSweep(getDb(env))
        .then((r) => console.log('attendance.autoAbsent.ok', r))
        .catch((err) =>
          console.error('attendance.autoAbsent.failed', { err }),
        ),
    );
  }
}
```

Commit.

---

## Task 4 — UI: tag auto-marked rows

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherAttendancePage.tsx`
- Modify: `apps/web/src/locales/en.ts` + `zh-CN.ts`

In the `RosterCard` row render, if `marks[id].notes === 'auto'`, render
a small muted badge next to the Notes input reading
`t('attendance.autoMarked')` so the teacher can distinguish auto-rows
from manual ones. Editing the row's status or notes immediately
overwrites it on Save — no special handling needed.

Locale keys: `attendance.autoMarked` (`Auto` / `自动`).

Commit.

---

## Task 5 — Tests

**Files:**
- Modify: `apps/api/src/routes/attendance.ts` (no behavior change, just
  surface so the new path is exercised)
- Create: `apps/api/src/services/attendanceAutoAbsent.test.ts`

Cover:
- WHERE clause eligibility: closed session skipped; session inside grace
  window skipped; session over the cutoff included; session older than
  14 days skipped.
- Per-session insert: existing record preserved (excused stays excused);
  enrollment with no record gets `absent` + `notes='auto'`.
- Concurrent run is a no-op via the unique constraint.

Commit.

---

## Task 6 — Wrap-up

1. `pnpm --filter @coursewise/api typecheck && pnpm --filter @coursewise/api test`
2. `pnpm --filter @coursewise/web typecheck && pnpm --filter @coursewise/web test`
3. **Manual smoke** (dev):
   - Create a session 6 minutes in the past with
     `absentAfterMinutes=5`. Make sure no one self-signed.
   - Open the teacher attendance page → records GET runs the lazy
     backstop → all enrolled students appear as `absent` with an
     `Auto` badge.
   - Manually flip one row to `excused`, Save → row stays excused.
   - Wait for the next 5-minute cron tick → no duplicate rows; sweep
     log shows `recordsInserted: 0`.
4. Standard PR workflow: one bundled PR titled
   `Attendance: auto-absent after sign-in cutoff`.
