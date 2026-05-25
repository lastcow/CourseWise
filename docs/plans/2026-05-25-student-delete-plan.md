# Student Account Hard-Delete — Implementation Plan

> Companion to `2026-05-25-student-delete-design.md`.

**Goal:** Add a `DELETE /api/students/:userId` endpoint that hard-deletes a
student account, sends a notification email, and records an audit row.
Surface a Danger Zone in the Students-page Modify dialog (admins + teachers
of the student's courses only).

**Tech Stack:** Hono · Drizzle ORM · Neon Postgres · Cloudflare Workers
(Email Service binding) · React · TanStack Query · Tailwind · i18next.

---

## Task 1 — DB migration: `user_deletion_log`

**Files:**
- Create: `apps/api/drizzle/0025_user_deletion.sql`
- Modify: `apps/api/drizzle/meta/_journal.json` (append entry for idx 25)
- Modify: `apps/api/src/db/schema.ts` — `export const userDeletionLog = pgTable(...)`

Columns per the design doc (`id, user_id, user_email, user_name, user_role,
deleted_by, deleted_at, reason, enrollment_count, email_status,
email_provider_id, child_counts`). Idempotent migration in the
`0014_course_deletion.sql` style. No FK on `user_id` / `deleted_by`.

Run `pnpm --filter @coursewise/api db:migrate`. Commit.

---

## Task 2 — Shared types

**Files:**
- Modify: `packages/shared/src/types.ts`

Add:
```ts
export interface DeleteStudentAccountInput {
  reason?: string | null;
}
export interface DeleteStudentAccountResponse {
  id: string;
  emailStatus: 'sent' | 'failed' | 'skipped';
}
```

Commit.

---

## Task 3 — Email template

**Files:**
- Create: `apps/api/src/services/userDropEmail.ts`
- Create: `apps/api/src/services/userDropEmail.test.ts`

Mirror `teacherInvitationEmail.ts` structure. Export
`renderStudentDropEmail({ name, courses, reason?, supportEmail })` →
`RenderedEmail`. Plain-text + HTML.

Snapshot test the rendered HTML so style regressions are loud. Commit.

---

## Task 4 — API: DELETE /api/students/:userId

**Files:**
- Modify: `apps/api/src/routes/students.ts`

Add a new handler:

1. Auth required (already covered by `r.use('*', requireAuth)`).
2. Permission predicate — reuse `canAccessStudentProfile` from existing
   route, but reject `student` role explicitly (the predicate currently
   allows self; here we ALSO refuse self-delete since the design says
   admins/teachers act on others).
3. Load the target user; 404 if missing; 400 if role !== `student`.
4. Snapshot enrollments (code, title) + child counts.
5. Render and attempt to send the email via `sendEmailViaCloudflare(c.env.SEND_EMAIL, ...)`.
   On failure or absent binding → mark `emailStatus = 'failed'` or `'skipped'`.
6. Insert `user_deletion_log` row.
7. Enqueue `r2_cleanup_jobs` rows for the user's file_assets (orphan-tolerant
   key style — the existing course-delete path is the template).
8. `DELETE FROM users WHERE id = :userId`.
9. `recordAudit(action='user.delete', target=userId, metadata={ enrollmentCount, emailStatus })`.
10. Return `{ id, emailStatus }`.

Add a `students.permissions.test.ts` case for the DELETE endpoint
(unauthenticated → 401).

Run `pnpm --filter @coursewise/api typecheck && test`. Commit.

---

## Task 5 — Web: query hook

**Files:**
- Modify: `apps/web/src/lib/queries.ts`

```ts
export function useDeleteStudentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; reason?: string | null }) =>
      apiCall<DeleteStudentAccountResponse>(`/api/students/${vars.userId}`, {
        method: 'DELETE',
        body: vars.reason ? { reason: vars.reason } : undefined,
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['course-students'] });
      void qc.removeQueries({ queryKey: ['student-profile', vars.userId] });
    },
  });
}
```

Commit.

---

## Task 6 — Web: Danger Zone in StudentProfileDialog

**Files:**
- Modify: `apps/web/src/components/students/StudentProfileDialog.tsx`
- Modify: `apps/web/src/locales/en.ts` and `zh-CN.ts`

- Accept a new prop `canDelete: boolean` from the parent (resolved from
  the caller's role + course context).
- If `canDelete` is true and the target's role is student and the target
  is not the current user, render a Danger Zone block with a destructive
  outline button.
- Clicking opens a second nested confirmation `<Dialog>`:
  - Shows target's name + email + enrollment count.
  - Email-confirmation input (must match the target's email).
  - Optional reason textarea.
  - `Delete permanently` destructive button. Disabled until the typed
    confirmation matches.
- On success: close both dialogs, toast `studentProfile.deleteSuccess`
  or `studentProfile.deleteEmailFailed` based on `emailStatus`.

Commit.

---

## Task 7 — Wire `canDelete` into Students pages

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherStudentsPage.tsx`
- Modify: `apps/web/src/pages/student/StudentStudentsPage.tsx`

Compute `canDelete` per page:
- Teacher page: `canDelete = true` for every row (the teacher already
  has overlap or is admin; backend is authoritative).
- Student page: `canDelete = false` (students never see the button).

Pass into the dialog.

Commit.

---

## Task 8 — i18n keys

**Files:**
- Modify: `apps/web/src/locales/en.ts` + `zh-CN.ts`

Add keys per the design doc under `studentProfile.*`:
`dangerZoneTitle, dangerZoneBody, deleteCta, deleteConfirmTitle,
deleteConfirmBody, deleteConfirmTypeLabel, deleteConfirmAction,
deleteSuccess, deleteEmailFailed, reasonLabel`.

Commit.

---

## Task 9 — Final wrap-up

1. `pnpm --filter @coursewise/api typecheck && pnpm --filter @coursewise/api test`
2. `pnpm --filter @coursewise/web typecheck && pnpm --filter @coursewise/web test`
3. Manual smoke:
   - Admin: open Students page, edit a sandbox student, click Delete →
     type email → confirm. Roster row disappears; sandbox email inbox
     shows the notification.
   - Teacher: same flow, only the students enrolled in their course.
   - Student: no Danger Zone visible.
   - API: directly call `DELETE /api/students/:OTHER_ID` as a teacher
     who does NOT teach any course the target is in → 403.
4. Standard PR workflow: one bundled PR titled
   `Student account hard-delete (admin + teacher)`.
