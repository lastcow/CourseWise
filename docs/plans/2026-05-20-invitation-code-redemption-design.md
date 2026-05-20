# Invitation-Code Redemption for Existing Students — Design

## Goal

Let a CourseWise student who already has an account enroll in additional courses by entering or following a teacher-issued invitation code. Today the only redemption path is `POST /api/auth/register-student`, which creates an account *and* enrolls in one step — existing students have no way to use a new code, so teachers fall back to manually enrolling them through the admin/teacher API.

## Why

A student is invited to course A, accepts the invitation, registers, and is enrolled. Their professor for course B later hands them a different invitation code. Today there is no path for that student to use the code: the register endpoint is unauthenticated and creates a new user (which would be a duplicate), and no authenticated redemption endpoint exists. The teacher's workaround is to look up the student's user id and manually call `POST /api/courses/:courseId/enrollments`. That defeats the purpose of an invitation code.

## Scope

In scope:

- New API endpoint `POST /api/invitation-codes/redeem` (authenticated, student-only).
- New in-app surface: a "Join a course" button on `StudentCoursesPage` that opens a `JoinCourseDialog` and submits to the new endpoint.
- New public URL `/invite/:code` (`InviteRedeemPage`) that branches on auth state:
  - logged out → redirect to `/register?invitationCode=…` (existing flow);
  - logged-in student → small confirmation card with a Join button calling the new endpoint;
  - logged-in non-student → "Codes are for students. Switch accounts." message.
- `RegisterPage`'s "Sign in instead" link is updated to pass `redirectTo=/invite/:code` so a student bouncing through login lands back on the invite confirmation card.
- Locale strings for the new dialog, page, and error states under `student.joinCourse.*` and `invite.*`.

Out of scope:

- Email-scoped codes (today's codes are bearer tokens — anyone with the code can use it).
- Automated student emails when a teacher generates a code (still copy/paste).
- Changes to teacher-side code generation.

## Flow

1. Teacher generates an invitation code for course B in the existing teacher UI (`TeacherInvitationsPage`). They share the code with the student out of band (chat, LMS, email) — either the raw code or a `/invite/CODE` link.
2. The student receives the code:
   - If they paste it into the in-app "Join a course" dialog while logged in, the dialog submits `POST /api/invitation-codes/redeem`.
   - If they open the link logged out, they land on `/register?invitationCode=CODE` and complete the existing one-step register-and-enroll.
   - If they open the link logged in, they see a confirmation card and click Join.
3. The redeem endpoint validates the code (active, not expired, not exhausted, course-scoped), checks current enrollment, and either enrolls or returns idempotently.
4. On success, the student's course list refreshes and they land on the course page.

## API

`POST /api/invitation-codes/redeem`
Auth: required, `user.role === 'student'`.
Body: `{ code: string }` validated by a new `redeemInvitationCodeSchema` in `packages/shared/src/validators.ts` (same trim/length constraints the register endpoint uses today).

Behavior, in order:

1. 403 if `user.role !== 'student'`.
2. Look up the code (case-insensitive, hits the existing unique index). Missing → 404.
3. Validate state: `status === 'active'`, not expired, `usedCount < maxUses` when `maxUses` is set. Any failure → 400 with the same reason strings the existing `POST /api/invitation-codes/validate` returns, so the front-end can share error copy.
4. Require `courseId !== null` (platform-level codes are out of scope for this flow). Otherwise 400.
5. Check current enrollment by `(studentId, courseId)`:
   - If `status='enrolled'` → return 200 `{ courseId, courseCode, courseTitle, alreadyEnrolled: true }`. Do NOT increment `usedCount`. No audit row.
   - If a `'dropped'` row exists → update it back to `'enrolled'` and continue.
   - If no row exists → insert one.
6. Increment `usedCount` with a guard predicate so concurrent redemption attempts can't oversubscribe a `maxUses`-bounded code:
   ```sql
   UPDATE invitation_codes
   SET used_count = used_count + 1
   WHERE id = $codeId AND (max_uses IS NULL OR used_count < max_uses)
   RETURNING id
   ```
   Zero rows returned by this update means the slot was taken between the validation read and the write — the handler aborts with 400 "Invitation code is exhausted".
7. The enrollment insert/update plus the increment plus the audit-row insert run in one Postgres CTE (the neon-http driver has no `db.transaction`; the `DELETE /api/courses/:courseId` handler that landed in the previous PR is the precedent).
8. Audit: `recordAudit({ action: 'enrollment.create.via-code', target: enrollmentId, metadata: { courseId, codeId } })`.
9. Return 200 `{ courseId, courseCode, courseTitle, alreadyEnrolled: false, enrollmentId }`.

## Shared types

`packages/shared/src/types.ts` gets:

```ts
export type RedeemInvitationCodeResponse = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  alreadyEnrolled: boolean;
  enrollmentId?: string;
};
```

`packages/shared/src/validators.ts` gets:

```ts
export const redeemInvitationCodeSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
```

## Web

### `JoinCourseDialog` (`apps/web/src/components/course/JoinCourseDialog.tsx`)

Self-contained dialog with one input (`code`), a Cancel button, and a Join button that submits a new `useRedeemInvitationCode()` mutation. Loading state on the button, inline error under the input on failure, toast on success (`"Joined [title]"` or `"You're already in [title]"`). Reuses the locale namespace for error strings so the dialog and the register form share copy.

### `StudentCoursesPage` entry point

Adds a "Join a course" button above the course list. `variant="default"` and prominent when `courses.length === 0` (empty-state CTA), `variant="outline"` otherwise. Click opens the dialog.

### `InviteRedeemPage` (`apps/web/src/pages/public/InviteRedeemPage.tsx`)

Mounted at `/invite/:code` in `apps/web/src/App.tsx`. Reads the code from the route param. Branches on `useAuth()`:

- Logged out → `<Navigate to={\`/register?invitationCode=${code}\`} replace />`.
- Logged in, `role === 'student'` → call a new `useValidateInvitationCode(code)` query (wraps the existing `POST /api/invitation-codes/validate`) so the card can show the real course title. Render a confirmation card and a Join button that calls `useRedeemInvitationCode()`. On success: navigate to `/student/courses/:courseId`. On already-enrolled: same navigation (the alreadyEnrolled flag flips a toast).
- Logged in, other role → render a small "Invitation codes are for student accounts" card with a "Back to dashboard" link.

### Login round-trip

`RegisterPage`'s "Sign in instead" link is updated to include `redirectTo=/invite/:code` when an `invitationCode` query is present. `LoginPage` already supports `redirectTo`, so the round-trip works without further changes.

### Front-end hooks (`apps/web/src/lib/queries.ts`)

Two new TanStack Query hooks:

```ts
export function useRedeemInvitationCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiCall<RedeemInvitationCodeResponse>('/invitation-codes/redeem', {
        method: 'POST',
        body: { code },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      qc.invalidateQueries({ queryKey: ['student', 'courses'] });
    },
  });
}

export function useValidateInvitationCode(code: string | undefined) {
  return useQuery({
    queryKey: ['invitation-code-validate', code],
    queryFn: () =>
      apiCall<{ valid: boolean; courseId: string | null; courseCode: string | null; courseTitle: string | null }>(
        `/invitation-codes/validate?code=${encodeURIComponent(code!)}`,
      ),
    enabled: !!code,
    retry: false,
  });
}
```

## Edge cases

| Scenario | Response | UX |
|---|---|---|
| Code not found | 404 | "We couldn't find that code. Check with your teacher." |
| Code revoked / expired / exhausted | 400 with reason | Mirrors `/validate` strings so register + redeem share copy. |
| Code has no `courseId` (platform-level) | 400 | Rare; same surface as malformed code. |
| Caller is teacher/admin | 403 | `/invite/:code` page shows "switch accounts" before Join is clickable; the 403 is defensive. |
| Already enrolled (`status='enrolled'`) | 200 `{ alreadyEnrolled: true }` | Dialog: "You're already in [course]. Open it?" + navigation. No usedCount increment, no audit row. |
| Previously dropped (`status='dropped'`) | 200, row flipped back to `'enrolled'`, usedCount incremented | Re-enrollment after a drop. Audit row emitted. |
| Race on the last slot | UPDATE-with-guard returns zero rows for the loser → 400 | Same guarantee the unauthenticated register flow has today. |

## Audit

Successful redemptions emit `action='enrollment.create.via-code'` rows. The `target` is the enrollment id. Metadata carries the courseId and the codeId (not the literal code value — codes are bearer tokens and shouldn't live in audit logs). Idempotent already-enrolled responses do not emit audit rows.

Public URL safety: `/invite/:code` is publicly reachable with any code string. The page reveals validity only through the existing `/validate` endpoint, which already rate-limits and does not distinguish "invalid" from "revoked"/"expired" reasons. The logged-out path simply forwards to `/register` and reuses that form's validation, matching today's privacy posture.

## Testing

API permissions (no DB):

- `POST /api/invitation-codes/redeem` without auth → 401.
- Same as teacher → 403.
- Same as admin → 403.
- Empty `code` body → 400.

API integration (skipped without `DATABASE_URL`, follows the `courseDeletion.integration.test.ts` pattern):

- Valid code, not yet enrolled → 200, enrollment row exists, `used_count` incremented.
- Valid code, already enrolled → 200 with `alreadyEnrolled: true`, `used_count` unchanged.
- Valid code, status='dropped' → 200, row flipped to `'enrolled'`, `used_count` incremented exactly once.
- Revoked / expired / exhausted code → 400 with the right reason.
- Code with `course_id IS NULL` → 400.
- Two concurrent redemptions on a code with `maxUses=1` and `usedCount=0` → exactly one 200, one 400.

Web:

- `JoinCourseDialog.test.tsx` — submit disabled until code is entered; success closes; error shows inline.
- `InviteRedeemPage.test.tsx` — logged-out branches to `/register?invitationCode=…`; logged-in student renders the Join card; logged-in non-student renders the switch-accounts card.

Manual smoke:

1. Logged-in student clicks "Join a course", pastes a valid code → enrolled, list refreshes.
2. Same student pastes the same code again → "already in [course]" toast, navigates to course.
3. Logged-out user visits `/invite/CODE` → register form pre-fills code → completes registration and enrolls.
4. Logged-in teacher visits `/invite/CODE` → switch-accounts card, no auto-redeem.

## Risks and trade-offs

- **Public `/invite/:code` URL** can be shared anywhere; it inherits today's bearer-token threat model (anyone with the code can use it). Email-scoped codes are the future-proof answer if the team wants to harden this — deliberately out of scope.
- **`/validate` endpoint reuse** for the confirmation card depends on the rate limiter staying tight — a logged-in user could otherwise iterate valid codes. The existing limiter is acceptable; revisit if abuse appears.
- **Race correctness** on the `used_count` increment depends on the guard-predicate approach. We accept that the loser of a race sees a 400 "exhausted" message rather than a queued retry; that matches today's register flow.
- **No backwards-compat shim** for the old "manual enrollment by teacher" path — it continues to work, this just adds a parallel route.
