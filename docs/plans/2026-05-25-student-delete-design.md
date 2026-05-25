# Student Account Hard-Delete — Design

**Goal:** Let admins and teachers permanently delete a student account from
the Students page, with a transactional email sent to the deleted user's
address. Used to recover from "registered with the wrong email" mistakes
since the system intentionally does not allow editing emails.

## Decided scope

- **Who can delete:** admin (any student), teacher (any student enrolled
  in a course the caller teaches). Co-teachers count.
- **What gets deleted:** the entire `users` row + cascades — enrollments,
  submissions, messages, quiz attempts, group memberships, attendance,
  etc. all go with it via existing `ON DELETE CASCADE` foreign keys.
  User-owned R2 file assets are queued for object purge through the
  same `r2_cleanup_jobs` worker that handles course delete.
- **Notification:** a transactional email goes to the deleted user's
  address listing the courses they were enrolled in (`code · title`),
  before the actual delete commits. Best-effort: if the email send fails
  we still delete the account but record `email_status='failed'` on the
  log row.
- **Self-delete:** out of scope. Admins and teachers act on others; this
  is not a "GDPR right to be forgotten" self-service flow.

## Data model

New append-only audit table, mirroring `course_deletion_log`:

```
user_deletion_log (
  id                    uuid pk
  user_id               uuid not null   -- orphan tolerant; user row is gone
  user_email            text not null   -- snapshot for the audit trail
  user_name             text not null
  user_role             text not null
  deleted_by            uuid           -- nullable; admin who triggered
  deleted_at            timestamptz default now() not null
  reason                text           -- free-text from the dialog
  enrollment_count      integer not null
  email_status          text not null  -- 'sent' | 'failed' | 'skipped'
  email_provider_id     text           -- Cloudflare messageId
  child_counts          jsonb not null -- {enrollments, submissions, messages, ...}
)
```

`user_id` and `deleted_by` intentionally carry no FK; the target row no
longer exists, and admins/teachers may themselves be deleted later. The
caller (deleted_by) is preserved as a uuid for audit.

## API

```
DELETE /api/students/:userId
```

Body (optional):

```jsonc
{ "reason": "wrong email at registration" }
```

Permission predicate (same as `studentProfile` PATCH but stricter — only
when caller can _act on_ this user):

- admin → allowed
- teacher → allowed iff there's an enrollment row joining the target
  student with a course the caller teaches
- student → 403 (cannot delete themselves or others through this path)

Flow:
1. Resolve target user. 404 if missing. 400 if role is not `student`
   (don't accidentally wipe staff via this endpoint — staff lifecycle
   lives under `/api/admin/users`).
2. Snapshot the courses the student is enrolled in (`code`, `title`) for
   the email + audit row.
3. Render the email body via a new `renderStudentDropEmail()` helper.
4. Attempt to send via `sendEmailViaCloudflare` if the
   `c.env.SEND_EMAIL` binding is configured; capture `messageId` or
   the failure. **Do not abort the delete on email failure.**
5. Snapshot child_counts (count of enrollments / submissions / messages /
   quiz attempts / attendance rows / etc.).
6. Insert the `user_deletion_log` row.
7. Enqueue an `r2_cleanup_jobs` row scoped to the user's file_assets so
   the existing worker tears down R2 objects.
8. `DELETE FROM users WHERE id = :userId` — FKs cascade through every
   child table that references `users.id`.
9. Audit (`action='user.delete', target=userId`).
10. Return 200 with `{ id, emailStatus }` so the UI can toast accordingly.

Neon HTTP driver still has no `BEGIN/COMMIT` — we lean on FK cascades
+ audit log insertion before the destructive DELETE so if the DELETE
fails the audit row is the only orphan (acceptable; it documents
intent and can be reconciled).

## Email

New service file `apps/api/src/services/userDropEmail.ts` exporting
`renderStudentDropEmail({ name, courses, reason?, supportEmail })`:

- Subject: `Your CourseWise account has been removed`
- Body lists each course the user was dropped from (code · title) and a
  one-line explanation:
  > Your CourseWise account, registered with this address, was removed
  > by your instructor / a CourseWise administrator. If this email was
  > set up by mistake or you weren't expecting it, you can safely ignore
  > this message.
- Plain-text and HTML variants (same multi-table style as the existing
  `teacherInvitationEmail.ts` template).

## UI

### Students page — Modify dialog

Add a **Danger Zone** section at the bottom of `<StudentProfileDialog>`
(`apps/web/src/components/students/StudentProfileDialog.tsx`), shown only
when the caller is admin OR a teacher with overlap (the backend already
enforces this on PATCH; we mirror in the UI so the button doesn't
appear for unauthorized callers).

```
┌──────────────────────────────────────────────┐
│ Danger zone                                  │
│ Delete this student account permanently.     │
│ All enrollments, submissions, messages, and  │
│ files associated with this user will be      │
│ removed. The user will receive a one-time    │
│ notification email.                          │
│                                              │
│ [ Delete student account ]   ← red outlined  │
└──────────────────────────────────────────────┘
```

Clicking "Delete student account" opens a second confirmation dialog
that:
- Repeats the target user's name + email and number of enrollments.
- Requires typing the user's email to enable the destructive button
  (same pattern as course hard-delete).
- Optional textarea: "Reason (for audit log)".
- Destructive button: `Delete permanently`.

On success: close both dialogs, toast `studentProfile.deleteSuccess` /
`studentProfile.deleteEmailFailed` depending on `emailStatus`, refresh
the roster.

### Permission gating in the UI

Caller-side: hide the Danger Zone when:
- The viewer is a student.
- The viewer is themselves the target.

Server-side is the authoritative gate (admin OR teacher-with-overlap).

## i18n

New keys under `studentProfile.*`: `dangerZoneTitle`, `dangerZoneBody`,
`deleteCta`, `deleteConfirmTitle`, `deleteConfirmBody`,
`deleteConfirmTypeLabel`, `deleteConfirmAction`, `deleteSuccess`,
`deleteEmailFailed`, `reasonLabel`. en + zh-CN.

## Out of scope / future work

- Self-delete (account closure by the user).
- Soft-delete + restore window.
- Bulk delete from a CSV.
- Re-issuing the original invitation code automatically.
