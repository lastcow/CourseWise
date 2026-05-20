# Invitation-Code Redemption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the authenticated-student invitation-code redemption flow per `docs/plans/2026-05-20-invitation-code-redemption-design.md`. After this lands, a student who already has an account can join an additional course either by pasting a code into the student app or by clicking a `/invite/CODE` URL.

**Architecture:** New `POST /api/invitation-codes/redeem` endpoint validates a code, enforces student-only, handles the already-enrolled case idempotently, and updates `invitation_codes.used_count` with a guard predicate (`WHERE used_count < max_uses`) so concurrent redemptions can't oversubscribe. The enrollment insert and the increment land in one Postgres CTE (same neon-http-friendly pattern as `DELETE /api/courses/:id`). Front-end adds a `JoinCourseDialog` to `StudentCoursesPage`, an `InviteRedeemPage` mounted at `/invite/:code`, and updates `RegisterPage`'s sign-in link to round-trip the code through `LoginPage`.

**Tech Stack:** TypeScript, Hono, Drizzle ORM (Postgres / Neon HTTP), Cloudflare Workers, Vitest, React, TanStack Query, react-i18next, Tailwind.

---

## Conventions

- Run commands from the worktree root: `/Users/zhijiangchen/CourseWise/.worktrees/invitation-code-redemption`.
- After each task: run task-scoped tests, then `pnpm typecheck`, then commit. Single-line commit messages, no `Co-Authored-By` footer (the final squash-merge handles attribution).
- API tests come in two flavours: `*.permissions.test.ts` (DB-free, wiring smoke); `*.integration.test.ts` (`describe.skipIf(!hasDb)`, runs locally with `DATABASE_URL`).
- Never bypass hooks (`--no-verify`). Never amend pushed commits. Stage files by name, not `git add -A`.

---

## Task 1: Shared validators + types

**Files:**
- Modify: `packages/shared/src/validators.ts`
- Modify: `packages/shared/src/types.ts`

**Step 1:** Append to `packages/shared/src/validators.ts` (place near the other invitation-code schemas):

```ts
export const redeemInvitationCodeSchema = z.object({
  code: invitationCodeStringSchema,
});
export type RedeemInvitationCodeInput = z.infer<typeof redeemInvitationCodeSchema>;
```

`invitationCodeStringSchema` already exists in this file — reuse it so the redeem path has identical trim + length rules to the create path.

**Step 2:** In `packages/shared/src/types.ts`, find `ValidateInvitationCodeResponse` (line ~141) and extend it to include `courseId` so the `InviteRedeemPage` confirmation card can render the title and route to the course:

```ts
export interface ValidateInvitationCodeResponse {
  valid: boolean;
  courseId?: string | null;
  courseTitle?: string | null;
}
```

Then append the new response type:

```ts
export interface RedeemInvitationCodeResponse {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  alreadyEnrolled: boolean;
  enrollmentId?: string;
}
```

**Step 3:** `pnpm --filter @coursewise/shared typecheck` → clean.

**Step 4:** Commit:

```bash
git add packages/shared/src/validators.ts packages/shared/src/types.ts
git commit -m "Shared: redeem schema + types for invitation-code redemption"
```

---

## Task 2: API endpoint — `POST /api/invitation-codes/redeem`

**Files:**
- Modify: `apps/api/src/routes/invitations.ts`
- Modify: `apps/api/src/routes/invitations.ts` (the existing `/validate` handler — extend response to include `courseId`)
- Create: `apps/api/src/routes/invitations.redeem.permissions.test.ts`

**Step 1:** Extend the existing `/invitation-codes/validate` response (line ~74) to include `courseId` so it matches the updated shared type. Change the final return to:

```ts
return respond({
  valid: true,
  courseId: row.course?.id ?? null,
  courseTitle: row.course?.title ?? null,
});
```

**Step 2:** Add the new redeem handler just below the existing `/invitation-codes/validate` route. Use the CTE pattern from `apps/api/src/routes/courses.ts` (the DELETE handler) so neon-http's lack of `db.transaction` isn't a blocker.

```ts
r.post('/invitation-codes/redeem', validateJson(redeemInvitationCodeSchema), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const input = c.get('validated') as RedeemInvitationCodeInput;

  if (auth.user.role !== 'student') {
    throw new ApiException(
      403,
      ERROR_CODES.FORBIDDEN,
      'Invitation codes are for student accounts',
    );
  }

  // Find the code + its course.
  const rows = await db
    .select({ ic: invitationCodes, course: courses })
    .from(invitationCodes)
    .leftJoin(courses, eq(invitationCodes.courseId, courses.id))
    .where(sql`lower(${invitationCodes.code}) = lower(${input.code})`)
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Invitation code not found');
  }

  const code = row.ic;
  if (code.status !== 'active') {
    throw new ApiException(400, ERROR_CODES.INVALID_INVITATION, 'Invitation code is not active');
  }
  if (code.expiresAt && new Date(code.expiresAt) <= new Date()) {
    throw new ApiException(400, ERROR_CODES.INVALID_INVITATION, 'Invitation code expired');
  }
  if (code.maxUses !== null && code.usedCount >= code.maxUses) {
    throw new ApiException(400, ERROR_CODES.INVALID_INVITATION, 'Invitation code is exhausted');
  }
  if (!code.courseId || !row.course) {
    throw new ApiException(
      400,
      ERROR_CODES.INVALID_INVITATION,
      'This code is not tied to a specific course',
    );
  }

  // Idempotency check.
  const [existing] = await db
    .select({ id: enrollments.id, status: enrollments.status })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, code.courseId), eq(enrollments.studentId, auth.user.id)))
    .limit(1);

  if (existing?.status === 'enrolled') {
    return success(c, {
      courseId: row.course.id,
      courseCode: row.course.code,
      courseTitle: row.course.title,
      alreadyEnrolled: true,
    } satisfies RedeemInvitationCodeResponse);
  }

  // Atomic CTE: increment used_count (with race-guard), then upsert the enrollment.
  // If the increment touches 0 rows, the slot was lost between our read and write
  // and we report the code as exhausted.
  const result = await db.execute(sql`
    WITH claimed AS (
      UPDATE invitation_codes
        SET used_count = used_count + 1,
            updated_at = now()
        WHERE id = ${code.id}
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
          AND (max_uses IS NULL OR used_count < max_uses)
        RETURNING id
    ),
    upserted AS (
      INSERT INTO enrollments (course_id, student_id, status)
      SELECT ${code.courseId}::uuid, ${auth.user.id}::uuid, 'enrolled'
      FROM claimed
      ON CONFLICT (course_id, student_id) DO UPDATE
        SET status = 'enrolled',
            updated_at = now()
      RETURNING id
    )
    SELECT
      (SELECT id FROM claimed)   AS claimed_id,
      (SELECT id FROM upserted)  AS enrollment_id
  `);
  const claimedId = result.rows[0]?.claimed_id as string | undefined;
  const enrollmentId = result.rows[0]?.enrollment_id as string | undefined;
  if (!claimedId || !enrollmentId) {
    throw new ApiException(400, ERROR_CODES.INVALID_INVITATION, 'Invitation code is exhausted');
  }

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'enrollment.create.via-code',
    target: enrollmentId,
    metadata: { courseId: row.course.id, codeId: code.id },
  });

  return success(c, {
    courseId: row.course.id,
    courseCode: row.course.code,
    courseTitle: row.course.title,
    alreadyEnrolled: false,
    enrollmentId,
  } satisfies RedeemInvitationCodeResponse);
});
```

**Imports to add at the top of `invitations.ts`**:
- From `drizzle-orm`: `and` (it may not be imported yet)
- From `'../db/schema'`: `enrollments`
- From `'@coursewise/shared'`: `redeemInvitationCodeSchema`, `type RedeemInvitationCodeInput`, `type RedeemInvitationCodeResponse`

Notes:
- The route is already under `r.use('*', requireAuth)`, so authentication is enforced.
- `enrollments.course_id` + `student_id` need a unique constraint for `ON CONFLICT` to work. Check the schema — `apps/api/src/db/schema.ts` around the `enrollments` table. If a unique index doesn't exist, raise this in your report (we may need a migration). If it does, proceed.

**Step 3:** Create the permissions test `apps/api/src/routes/invitations.redeem.permissions.test.ts` modelled on `cou13.permissions.test.ts`. Required cases:

```ts
import { describe, expect, it } from 'vitest';
import app from '../index';
import type { Env } from '../index';

const env: Env = { /* copy verbatim from cou13.permissions.test.ts */ };

describe('Invitation-code redeem wiring', () => {
  it('POST /api/invitation-codes/redeem without auth → 401', async () => {
    const res = await app.request('/api/invitation-codes/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'ABC-DEF' }),
    }, env);
    expect(res.status).toBe(401);
  });

  it('POST /api/invitation-codes/redeem with empty body → 401 (auth wins over body)', async () => {
    const res = await app.request('/api/invitation-codes/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }, env);
    expect(res.status).toBe(401);
  });
});
```

**Step 4:** Run:

```bash
pnpm --filter @coursewise/api test -- invitations.redeem
pnpm --filter @coursewise/api typecheck
```

Both clean.

**Step 5:** Commit:

```bash
git add apps/api/src/routes/invitations.ts apps/api/src/routes/invitations.redeem.permissions.test.ts
git commit -m "API: POST /invitation-codes/redeem for authenticated students"
```

---

## Task 3: Integration test (DB-gated)

**Files:**
- Create: `apps/api/src/routes/invitations.redeem.integration.test.ts`

Mirror the structure of `apps/api/src/routes/courseDeletion.integration.test.ts`. Use `describe.skipIf(!hasDb)` so it skips without `DATABASE_URL`. Seed via direct Drizzle inserts.

**Test scenarios:**

Seed (`beforeEach`): one admin, one teacher, one student, one course (`INT-RDM-101`), one active invitation code with `maxUses=2, usedCount=0, courseId=<courseId>`. Clean up between tests so each starts from the same baseline.

Tests:

1. **Valid code, not enrolled →** `POST /invitation-codes/redeem` with `{ code }` as student → 200, `alreadyEnrolled: false`, enrollment row exists with status `'enrolled'`, code's `used_count = 1`.

2. **Valid code, already enrolled →** Insert an `enrolled` row first, then redeem → 200, `alreadyEnrolled: true`, code's `used_count` UNCHANGED, no new enrollment row.

3. **Previously dropped →** Insert a `dropped` row, redeem → 200, `alreadyEnrolled: false`, enrollment row flips to `'enrolled'`, `used_count = 1`.

4. **Caller is teacher →** Redeem as teacher → 403.

5. **Caller is admin →** Redeem as admin → 403.

6. **Code revoked →** Set code status to `'revoked'`, redeem → 400.

7. **Code expired →** Set `expires_at` to a past timestamp, redeem → 400.

8. **Code exhausted →** Set `usedCount=2` to match `maxUses`, redeem → 400.

9. **Code missing →** Use a code that doesn't exist → 404.

10. **Course-less code →** Insert a code with `courseId=null`, redeem → 400.

11. **Concurrent race:** Set `maxUses=1, usedCount=0`. Spawn two parallel redeem requests for two different students. Exactly one returns 200, one returns 400. After both settle, `used_count = 1`.

**Step 1:** Open `courseDeletion.integration.test.ts` and copy:
- The `hasDb` constant
- The env literal
- The login helper (or use the JWT-signing helper — whichever pattern that file uses)
- The Drizzle client setup
- The cleanup pattern

**Step 2:** Implement the 11 tests. The concurrent-race test uses `await Promise.all([...])` over two parallel `app.request(...)` calls signed as two different students.

**Step 3:** Run:

```bash
pnpm --filter @coursewise/api test -- invitations.redeem.integration
```

Expect output like `(11 tests | 11 skipped)`.

**Step 4:** Typecheck:

```bash
pnpm --filter @coursewise/api typecheck
```

Clean. This is the primary correctness gate since the tests don't run today.

**Step 5:** Commit:

```bash
git add apps/api/src/routes/invitations.redeem.integration.test.ts
git commit -m "Test: invitation-code redeem integration coverage"
```

---

## Task 4: Front-end hooks

**Files:**
- Modify: `apps/web/src/lib/queries.ts`

**Step 1:** Add `useValidateInvitationCode` and `useRedeemInvitationCode` to `queries.ts`. The codebase uses `apiCall<T>(path, opts)` returning `payload.data` — match that exactly.

```ts
import type {
  RedeemInvitationCodeResponse,
  ValidateInvitationCodeResponse,
} from '@coursewise/shared';

export function useValidateInvitationCode(code: string | undefined) {
  return useQuery({
    queryKey: ['invitation-code-validate', code],
    queryFn: () =>
      apiCall<ValidateInvitationCodeResponse>('/invitation-codes/validate', {
        method: 'POST',
        body: { code: code! },
      }),
    enabled: !!code,
    retry: false,
  });
}

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
```

Verify against the existing `useDeleteCourse` mutation in the same file to confirm the `apiCall` signature.

**Step 2:** Run:

```bash
pnpm --filter @coursewise/web typecheck
```

Clean.

**Step 3:** Commit:

```bash
git add apps/web/src/lib/queries.ts
git commit -m "Web: invitation-code validate + redeem mutations"
```

---

## Task 5: `JoinCourseDialog` component (TDD)

**Files:**
- Create: `apps/web/src/components/course/JoinCourseDialog.tsx`
- Create: `apps/web/src/components/course/JoinCourseDialog.test.tsx`

The web test infra (jsdom + testing-library) was added in the previous PR — already wired up.

**Step 1:** Failing test:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JoinCourseDialog } from './JoinCourseDialog';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('JoinCourseDialog', () => {
  it('disables the Join button until a code is entered', () => {
    wrap(<JoinCourseDialog open onOpenChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /join/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/invitation code/i), {
      target: { value: 'INV-AAAA-BBBB' },
    });
    expect(btn).toBeEnabled();
  });
});
```

**Step 2:** Run — expect failure.

```bash
pnpm --filter @coursewise/web test -- JoinCourseDialog
```

**Step 3:** Implement using the same Dialog primitive that `DeleteCourseDialog` uses. Open `apps/web/src/components/course/DeleteCourseDialog.tsx` and `apps/web/src/components/ui/dialog.tsx` to confirm the API; adapt.

```tsx
import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useRedeemInvitationCode } from '@/lib/queries';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner'; // or whatever toast lib the codebase uses
import { useNavigate } from 'react-router-dom';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function JoinCourseDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const redeem = useRedeemInvitationCode();
  const navigate = useNavigate();

  async function onSubmit() {
    setError(null);
    try {
      const result = await redeem.mutateAsync(code);
      onOpenChange(false);
      setCode('');
      // Toast key flips on alreadyEnrolled flag.
      // (Toast lib pattern — copy from existing code in this repo)
      navigate(`/student/courses/${result.courseId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={t('student.joinCourse.title')}
    >
      <p className="text-sm text-muted-foreground">
        {t('student.joinCourse.description')}
      </p>
      <Label htmlFor="join-course-code" className="mt-4 block">
        {t('student.joinCourse.codeLabel')}
      </Label>
      <Input
        id="join-course-code"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        aria-label={t('student.joinCourse.codeLabel')}
        placeholder="INV-XXXX-YYYY"
      />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button disabled={!code.trim() || redeem.isPending} onClick={onSubmit}>
          {redeem.isPending ? t('student.joinCourse.joining') : t('student.joinCourse.join')}
        </Button>
      </div>
    </Dialog>
  );
}
```

**Caveats**:
- The repo's `Dialog` primitive may not have `onClose`/`title` exactly as shown above. Look at how `DeleteCourseDialog` is rendered for the source-of-truth pattern.
- The toast library and import path: grep an existing toast call (e.g. in `TeacherInvitationsPage.tsx` or anywhere `toast.success` appears) and copy that.
- For i18n, hard-code English temporarily; locale keys land in Task 8. If you do use `t()`, the test setup that imports `i18n` will keep things resolving — but you'll need to add the keys in en.ts before this test passes if `t()` returns the raw key.

**Step 4:** Run — expect pass.

**Step 5:** Commit:

```bash
git add apps/web/src/components/course/JoinCourseDialog.tsx apps/web/src/components/course/JoinCourseDialog.test.tsx
git commit -m "Web: JoinCourseDialog with type-to-redeem flow"
```

---

## Task 6: Wire button into `StudentCoursesPage`

**Files:**
- Modify: `apps/web/src/pages/student/StudentCoursesPage.tsx`

**Step 1:** Add a "Join a course" button + dialog state. Grep first to understand the page's existing layout:

```bash
grep -n "useCourses\|return" apps/web/src/pages/student/StudentCoursesPage.tsx | head -10
```

**Step 2:** Add at the top of the JSX (above the courses list):

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { JoinCourseDialog } from '@/components/course/JoinCourseDialog';

// inside the component:
const [joinOpen, setJoinOpen] = useState(false);

// in the JSX, above the courses list:
<div className="mb-4 flex justify-end">
  <Button
    variant={courses.length === 0 ? 'default' : 'outline'}
    onClick={() => setJoinOpen(true)}
  >
    {t('student.joinCourse.button')}
  </Button>
</div>
<JoinCourseDialog open={joinOpen} onOpenChange={setJoinOpen} />
```

If `courses.length` isn't accessible without unwrapping the query, adapt: `(coursesQuery.data?.length ?? 0) === 0`.

**Step 3:** Typecheck:

```bash
pnpm --filter @coursewise/web typecheck
```

**Step 4:** Commit:

```bash
git add apps/web/src/pages/student/StudentCoursesPage.tsx
git commit -m "Web: 'Join a course' button on student courses page"
```

---

## Task 7: `InviteRedeemPage` + route + login round-trip

**Files:**
- Create: `apps/web/src/pages/public/InviteRedeemPage.tsx`
- Modify: `apps/web/src/App.tsx` (add the route)
- Modify: `apps/web/src/pages/public/RegisterPage.tsx` (update "Sign in instead" link)

**Step 1:** Create `InviteRedeemPage.tsx`:

```tsx
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/authContext';
import {
  useRedeemInvitationCode,
  useValidateInvitationCode,
} from '@/lib/queries';
import { Button } from '@/components/ui/button';

export function InviteRedeemPage(): JSX.Element {
  const { t } = useTranslation();
  const { code = '' } = useParams<{ code: string }>();
  const { auth } = useAuth();
  const navigate = useNavigate();
  const validate = useValidateInvitationCode(auth ? code : undefined);
  const redeem = useRedeemInvitationCode();

  if (!auth) {
    return <Navigate to={`/register?invitationCode=${encodeURIComponent(code)}`} replace />;
  }
  if (auth.user.role !== 'student') {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold">{t('invite.notStudent.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('invite.notStudent.body')}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/')}>
          {t('invite.notStudent.back')}
        </Button>
      </div>
    );
  }
  if (validate.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('invite.loading')}</div>;
  }
  if (validate.isError || !validate.data?.valid) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold text-red-800">{t('invite.invalid.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('invite.invalid.body')}</p>
      </div>
    );
  }
  const courseTitle = validate.data.courseTitle ?? t('invite.fallbackCourseLabel');

  async function onJoin() {
    const result = await redeem.mutateAsync(code);
    navigate(`/student/courses/${result.courseId}`);
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">{t('invite.join.title', { course: courseTitle })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('invite.join.body')}</p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => navigate('/')}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onJoin} disabled={redeem.isPending}>
          {redeem.isPending ? t('invite.join.joining') : t('invite.join.cta')}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2:** Mount the route. Open `apps/web/src/App.tsx` and add `/invite/:code` alongside the other public routes (e.g. `/register`, `/login`). Make sure it lives in the *public* (unauthenticated) section, since logged-out users must reach it.

```tsx
<Route path="/invite/:code" element={<InviteRedeemPage />} />
```

**Step 3:** Update `RegisterPage.tsx`'s "Sign in instead" link. Find the link (grep for `Sign in` or `loginPath`) and conditionally append `?redirectTo=/invite/CODE` when the URL has an `invitationCode` query param.

The simplest pattern:

```tsx
const [params] = useSearchParams();
const inviteCode = params.get('invitationCode');
const signInHref = inviteCode
  ? `/login?redirectTo=${encodeURIComponent(`/invite/${inviteCode}`)}`
  : '/login';
```

Then the existing `<Link to={signInHref}>` (or `<a href>`) uses that. Confirm `LoginPage` already honours `?redirectTo=` (it should — grep for `redirectTo` in `LoginPage.tsx` and surrounding auth code).

**Step 4:** Typecheck:

```bash
pnpm --filter @coursewise/web typecheck
```

**Step 5:** Commit:

```bash
git add apps/web/src/pages/public/InviteRedeemPage.tsx apps/web/src/App.tsx apps/web/src/pages/public/RegisterPage.tsx
git commit -m "Web: /invite/:code public page + register sign-in round-trip"
```

---

## Task 8: Locale strings

**Files:**
- Modify: `apps/web/src/locales/en.ts`
- Modify: `apps/web/src/locales/zh-CN.ts`

**Required keys** (every key must exist in BOTH files):

```
student.joinCourse.button       — "Join a course"
student.joinCourse.title        — "Join a course"
student.joinCourse.description  — "Paste the invitation code your teacher shared."
student.joinCourse.codeLabel    — "Invitation code"
student.joinCourse.join         — "Join"
student.joinCourse.joining      — "Joining..."

student.joinCourse.toast.joined         — "Joined {{course}}"
student.joinCourse.toast.alreadyEnrolled — "You're already in {{course}}"

invite.loading                     — "Loading..."
invite.invalid.title               — "Invitation not valid"
invite.invalid.body                — "This invitation code is invalid, expired, or already used. Check with your teacher."
invite.notStudent.title            — "Switch accounts to join"
invite.notStudent.body             — "Invitation codes are for student accounts. Switch to a student account to join."
invite.notStudent.back             — "Back"
invite.fallbackCourseLabel         — "this course"
invite.join.title                  — "Join {{course}}?"
invite.join.body                   — "You'll be enrolled and can start working right away."
invite.join.cta                    — "Join course"
invite.join.joining                — "Joining..."

errors.invitationCodeNotFound    — "We couldn't find that code. Check with your teacher."
errors.invitationCodeExhausted   — "This invitation code has already been used."
errors.invitationCodeExpired     — "This invitation code has expired."
errors.invitationCodeRevoked     — "This invitation code is no longer active."
errors.invitationCodeNoCourse    — "This code isn't tied to a specific course."
```

Suggested zh-CN translations (refine if you want):

```
student.joinCourse.button       — 加入课程
student.joinCourse.title        — 加入课程
student.joinCourse.description  — 粘贴你的教师分享的邀请码。
student.joinCourse.codeLabel    — 邀请码
student.joinCourse.join         — 加入
student.joinCourse.joining      — 加入中…
student.joinCourse.toast.joined         — 已加入 {{course}}
student.joinCourse.toast.alreadyEnrolled — 你已在 {{course}} 中
invite.loading                     — 加载中…
invite.invalid.title               — 邀请无效
invite.invalid.body                — 此邀请码无效、已过期或已被使用。请与你的教师联系。
invite.notStudent.title            — 请切换账号以加入
invite.notStudent.body             — 邀请码仅限学生账号使用。请切换到学生账号后再尝试。
invite.notStudent.back             — 返回
invite.fallbackCourseLabel         — 该课程
invite.join.title                  — 加入 {{course}}？
invite.join.body                   — 加入后即可立即开始学习。
invite.join.cta                    — 加入课程
invite.join.joining                — 加入中…
errors.invitationCodeNotFound    — 未找到该邀请码，请与你的教师联系。
errors.invitationCodeExhausted   — 该邀请码已被使用完。
errors.invitationCodeExpired     — 该邀请码已过期。
errors.invitationCodeRevoked     — 该邀请码已停用。
errors.invitationCodeNoCourse    — 该邀请码未绑定到具体课程。
```

**Step 1:** Add all keys to both files. Replace any hard-coded English strings in `JoinCourseDialog.tsx` and `InviteRedeemPage.tsx` from Tasks 5 + 7 with `t(...)` calls. Match the existing pattern in the codebase (grep `useTranslation` in another existing component).

**Step 2:** Re-run the web tests; the `JoinCourseDialog` test must still pass because the assertions match the new English strings (`/join/i`, `/invitation code/i`).

```bash
pnpm --filter @coursewise/web test
```

**Step 3:** Typecheck:

```bash
pnpm --filter @coursewise/web typecheck
```

**Step 4:** Commit:

```bash
git add apps/web/src/locales/ apps/web/src/components/course/JoinCourseDialog.tsx apps/web/src/pages/public/InviteRedeemPage.tsx apps/web/src/pages/student/StudentCoursesPage.tsx
git commit -m "i18n: invitation-code redemption strings"
```

---

## Task 9: Full repo verification

**Step 1:** From the worktree root:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

All three must be clean.

**Step 2:** Manual smoke (optional — best done with a local DB and dev server):

1. Log in as a registered student → click "Join a course" → paste a valid code → enrolled, navigated to course.
2. Same student pastes the same code → "already enrolled" toast, lands on course page.
3. Visit `/invite/SOMECODE` while logged out → register form pre-fills code.
4. Visit `/invite/SOMECODE` while logged in as teacher → switch-accounts message.

**Step 3:** No new commit — verification only.

---

## Task 10: Push + PR + merge

```bash
git push -u origin invitation-code-redemption
gh pr create --title "Invitation-code redemption for existing students" --body "$(cat <<'EOF'
## Summary
- Authenticated students can redeem an invitation code to enroll in an additional course (in-app "Join a course" dialog, or shared /invite/CODE link)
- New POST /api/invitation-codes/redeem; idempotent on already-enrolled; race-safe via CTE-guarded used_count increment
- Logged-out /invite/CODE → existing register flow with code pre-filled; logged-in non-student → "switch accounts" message
- Full i18n (en + zh-CN); permissions + integration tests

## Test plan
- [ ] pnpm typecheck + test + lint all green
- [ ] Manual: student "Join a course" dialog → enrolled
- [ ] Manual: same student re-paste same code → "already enrolled"
- [ ] Manual: /invite/CODE while logged out → register form pre-filled
- [ ] Manual: /invite/CODE while logged in as teacher → switch-accounts card
- [ ] DB integration: pnpm --filter @coursewise/api test -- invitations.redeem.integration with DATABASE_URL set

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
```

---

## Notes for the executor

- **Schema dependency:** `enrollments (course_id, student_id)` needs a unique constraint for `ON CONFLICT` to work. Verify in `apps/api/src/db/schema.ts` before writing the CTE; if missing, raise it as a blocker (a small migration would be required first).
- **Toast library:** grep an existing call site to copy the import + API exactly. Don't introduce a new toast dependency.
- **Test setup:** jsdom + testing-library are already wired (previous PR). No infra to add.
- **Don't bypass hooks.** Don't `--no-verify`. Don't amend pushed commits.
- **The plan deliberately keeps recordAudit OUTSIDE the CTE.** If the audit insert fails after the enrollment succeeds, the course is still joined and the user can still use it — losing the audit row is acceptable; refusing to enroll because audit failed is not.
