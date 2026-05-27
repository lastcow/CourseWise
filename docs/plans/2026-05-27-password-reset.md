# Password Reset Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add self-service "forgot password" plus an admin/teacher-initiated "send reset link" action on the student roster.

**Architecture:** Mirror the existing teacher-invitations feature: a hashed, single-use, 1-hour token in a new `password_reset_tokens` table; two public endpoints (`forgot-password`, `reset-password`) and one authorized endpoint (`/students/:userId/reset-password-link`); best-effort email with a copyable-link fallback. Frontend adds two public pages, a login link, and a roster action icon.

**Tech Stack:** Hono + Drizzle (Cloudflare Workers) backend; React 18 + React Router v6 + TanStack Query frontend; bcryptjs; `jose`; react-i18next (en / zh-CN / fr). Tests: vitest. DB-touching integration tests gate on `process.env.DATABASE_URL`; permission/render tests run without a DB.

**Design doc:** `docs/plans/2026-05-27-password-reset-design.md`

## Conventions to follow

- Token gen: `randomBase62(48)` + `sha256Hex()` from `apps/api/src/lib/crypto.ts` (see `services/teacherInvitations.ts:9`).
- Errors: `throw new ApiException(status, ERROR_CODES.X, 'msg')` from `lib/errors.ts`; success via `success(c, body)` from `lib/response.ts`.
- Timestamps: ISO strings (`mode: 'string'`).
- Rate limiting: `getRateLimiter(c.env.RATE_LIMIT_KV).consume(key, max, windowSeconds)` (see `routes/auth.ts:188`).
- Best-effort email: `sendEmailViaCloudflare(env.SEND_EMAIL, {...})`, wrapped in try/catch returning a boolean (see `routes/teacherInvitations.ts:46`).
- Frontend data: `apiCall<T>(path, { method, body })` + `useMutation` (see `lib/queries.ts`).
- Commit after each task with the `feat:` / `test:` prefix shown.

---

## Task 1: Shared validators + response types

**Files:**
- Modify: `packages/shared/src/validators.ts`
- Test: `packages/shared/src/validators.test.ts`

**Step 1 — Write failing tests.** Append to `validators.test.ts`:

```ts
import { forgotPasswordSchema, resetPasswordSchema } from './validators';

describe('forgotPasswordSchema', () => {
  it('lowercases + trims email', () => {
    expect(forgotPasswordSchema.parse({ email: '  A@B.COM ' })).toEqual({ email: 'a@b.com' });
  });
  it('rejects bad email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts token + 8+ char password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'longenough' }).success).toBe(true);
  });
  it('rejects short password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'short' }).success).toBe(false);
  });
  it('rejects empty token', () => {
    expect(resetPasswordSchema.safeParse({ token: '', password: 'longenough' }).success).toBe(false);
  });
});
```

**Step 2 — Run, expect fail:** `pnpm --filter @coursewise/shared test` → FAIL (schemas not exported).

**Step 3 — Implement.** Add to `validators.ts` (after `refreshSchema`):

```ts
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(128),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

Add to `packages/shared/src/types.ts`:

```ts
export interface SendResetLinkResponse {
  resetUrl: string;
  emailSent: boolean;
}
```

**Step 4 — Run, expect pass:** `pnpm --filter @coursewise/shared test`.

**Step 5 — Commit:**
```bash
git add packages/shared/src
git commit -m "feat: add password-reset shared validators and types"
```

---

## Task 2: `password_reset_tokens` table + migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Generate: a new file under `apps/api/drizzle/` (or wherever `db:generate` emits)

**Step 1 — Add table** near `refreshTokens` in `schema.ts`:

```ts
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('password_reset_tokens_token_hash_idx').on(t.tokenHash),
    userIdx: index('password_reset_tokens_user_idx').on(t.userId),
  }),
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
```

Confirm `index` and `uniqueIndex` are already imported in `schema.ts` (they are, used by `refreshTokens`).

**Step 2 — Generate migration:**
```bash
pnpm --filter @coursewise/api db:generate
```
Expected: a new SQL migration creating `password_reset_tokens`. Review it.

**Step 3 — Typecheck:** `pnpm --filter @coursewise/api typecheck` → PASS.

**Step 4 — Commit:**
```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat: add password_reset_tokens table + migration"
```

> Note: `db:migrate` against a live Neon DB is an operator step, run at deploy time — not part of local TDD.

---

## Task 3: `passwordReset.ts` service

**Files:**
- Create: `apps/api/src/services/passwordReset.ts`
- Test: `apps/api/src/services/passwordReset.test.ts`

**Step 1 — Failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { generateResetToken, PASSWORD_RESET_TTL_MINUTES, resetExpiry } from './passwordReset';

describe('generateResetToken', () => {
  it('returns a 48-char plaintext and its sha256 hash', async () => {
    const a = await generateResetToken();
    expect(a.plaintext).toHaveLength(48);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    const b = await generateResetToken();
    expect(b.plaintext).not.toEqual(a.plaintext); // random
  });
});

describe('resetExpiry', () => {
  it('is PASSWORD_RESET_TTL_MINUTES in the future', () => {
    const now = new Date('2026-05-27T00:00:00.000Z');
    expect(resetExpiry(now)).toBe(
      new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000).toISOString(),
    );
  });
});
```

**Step 2 — Run, expect fail:** `pnpm --filter @coursewise/api test passwordReset`.

**Step 3 — Implement `passwordReset.ts`:**

```ts
import { and, eq, isNull } from 'drizzle-orm';
import { randomBase62, sha256Hex } from '../lib/crypto';
import { passwordResetTokens } from '../db/schema';
import type { Db } from '../db/client';

export const PASSWORD_RESET_TTL_MINUTES = 60;
export const PASSWORD_RESET_TOKEN_LENGTH = 48;

export async function generateResetToken(): Promise<{ plaintext: string; hash: string }> {
  const plaintext = randomBase62(PASSWORD_RESET_TOKEN_LENGTH);
  const hash = await sha256Hex(plaintext);
  return { plaintext, hash };
}

export function resetExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000).toISOString();
}

/** Mark every still-unused token for a user as used, so only the newest link works. */
export async function invalidateUserResetTokens(db: Db, userId: string): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
}

/**
 * Issue a fresh reset token for a user: invalidate older ones, insert the new
 * hash. Returns the plaintext to embed in the link. Pure DB + crypto, no email.
 */
export async function issueResetToken(db: Db, userId: string): Promise<string> {
  await invalidateUserResetTokens(db, userId);
  const { plaintext, hash } = await generateResetToken();
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hash,
    expiresAt: resetExpiry(),
  });
  return plaintext;
}
```

**Step 4 — Run, expect pass:** `pnpm --filter @coursewise/api test passwordReset`.

**Step 5 — Commit:**
```bash
git add apps/api/src/services/passwordReset.ts apps/api/src/services/passwordReset.test.ts
git commit -m "feat: add passwordReset token service"
```

---

## Task 4: `passwordResetEmail.ts` template

**Files:**
- Create: `apps/api/src/services/passwordResetEmail.ts`
- Test: `apps/api/src/services/passwordResetEmail.test.ts`

**Step 1 — Failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { renderPasswordResetEmail } from './passwordResetEmail';

describe('renderPasswordResetEmail', () => {
  const r = renderPasswordResetEmail({ resetUrl: 'https://app.test/reset-password?token=abc', expiresMinutes: 60 });
  it('has subject, html, text', () => {
    expect(r.subject).toMatch(/reset/i);
    expect(r.html).toContain('https://app.test/reset-password?token=abc');
    expect(r.text).toContain('https://app.test/reset-password?token=abc');
  });
  it('escapes nothing dangerous and mentions expiry', () => {
    expect(r.text).toContain('60');
  });
});
```

**Step 2 — Run, expect fail.**

**Step 3 — Implement** `passwordResetEmail.ts`, copying the structure/`escapeHtml` of `teacherInvitationEmail.ts`. Signature:

```ts
export interface PasswordResetEmailVars {
  resetUrl: string;
  expiresMinutes: number;
}
export interface RenderedEmail { subject: string; html: string; text: string; }

export function renderPasswordResetEmail(v: PasswordResetEmailVars): RenderedEmail { /* ... */ }
```

Subject: `Reset your CourseWise password`. Body: a primary button linking to `resetUrl`, a plain-URL fallback, and a line "This link expires in {expiresMinutes} minutes. If you didn't request this, you can ignore this email." Reuse the table-based HTML shell from `teacherInvitationEmail.ts`. Escape `resetUrl` for both the `href` attribute and the visible text.

**Step 4 — Run, expect pass.**

**Step 5 — Commit:**
```bash
git add apps/api/src/services/passwordResetEmail.ts apps/api/src/services/passwordResetEmail.test.ts
git commit -m "feat: add password-reset email template"
```

---

## Task 5: Public endpoints `forgot-password` + `reset-password`

**Files:**
- Modify: `apps/api/src/routes/auth.ts`
- Test (permissions, no DB): `apps/api/src/routes/passwordReset.permissions.test.ts`
- Test (integration, DB-gated): `apps/api/src/routes/passwordReset.integration.test.ts`

**Step 1 — Failing permission test** (`passwordReset.permissions.test.ts`), modeled on `students.permissions.test.ts`. Since `forgot-password` is enumeration-safe, an unknown email still returns 200:

```ts
import { describe, expect, it } from 'vitest';
import app from '../index';
import type { Env } from '../index';

const env: Env = { /* same shape as students.permissions.test.ts */ } as Env;

describe('forgot-password — shape', () => {
  it('rejects an invalid email body with 400', async () => {
    const res = await app.request('/api/auth/forgot-password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    }, env);
    expect(res.status).toBe(400);
  });
});

describe('reset-password — shape', () => {
  it('rejects a short password with 400', async () => {
    const res = await app.request('/api/auth/reset-password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'abc', password: 'short' }),
    }, env);
    expect(res.status).toBe(400);
  });
});
```

> Note: a valid-body `forgot-password` call hits the DB, so assert only validation (400) here; success-path behavior is covered in the integration test.

**Step 2 — Run, expect fail.**

**Step 3 — Implement in `auth.ts`.** Add imports:

```ts
import { forgotPasswordSchema, resetPasswordSchema, type ForgotPasswordInput, type ResetPasswordInput } from '@coursewise/shared';
import { passwordResetTokens } from '../db/schema';
import { issueResetToken, invalidateUserResetTokens } from '../services/passwordReset';
import { renderPasswordResetEmail } from '../services/passwordResetEmail';
import { sendEmailViaCloudflare } from '../services/email';
import { PASSWORD_RESET_TTL_MINUTES } from '../services/passwordReset';
```

Add a reset-URL builder (mirror `inviteCreateUrl` origin logic in `routes/teacherInvitations.ts`):

```ts
function resetUrlFor(c: Context<AppEnv>, token: string): string {
  const origin =
    c.req.header('origin') ??
    (c.req.header('referer') ? new URL(c.req.header('referer')!).origin : null) ??
    (c.env.CORS_ORIGIN && c.env.CORS_ORIGIN !== '*' ? c.env.CORS_ORIGIN : 'http://localhost:5173');
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

const DEFAULT_EMAIL_FROM = 'CourseWise <noreply@fsuac.com>';

async function trySendResetEmail(c: Context<AppEnv>, to: string, resetUrl: string): Promise<boolean> {
  if (!c.env.SEND_EMAIL) return false;
  const tmpl = renderPasswordResetEmail({ resetUrl, expiresMinutes: PASSWORD_RESET_TTL_MINUTES });
  try {
    await sendEmailViaCloudflare(c.env.SEND_EMAIL, {
      to, from: c.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
      subject: tmpl.subject, html: tmpl.html, text: tmpl.text,
    });
    return true;
  } catch (err) {
    console.error('password-reset: email send failed', { to, err });
    return false;
  }
}
```

`forgot-password` handler (enumeration-safe, rate-limited per email + per IP):

```ts
auth.post('/forgot-password', validateJson(forgotPasswordSchema), async (c) => {
  const { email } = c.get('validated') as ForgotPasswordInput;
  const db = c.get('db');
  const meta = requestMeta(c);
  const limiter = getRateLimiter(c.env.RATE_LIMIT_KV);
  const byEmail = await limiter.consume(`forgot:${email}`, 5, 900);
  const byIp = await limiter.consume(`forgot-ip:${meta.ip ?? 'unknown'}`, 20, 900);
  if (!byEmail.allowed || !byIp.allowed) {
    throw new ApiException(429, ERROR_CODES.RATE_LIMITED, 'Too many requests');
  }

  const rows = await db.select().from(users)
    .where(sql`lower(${users.email}) = lower(${email})`).limit(1);
  const user = rows[0];
  if (user && user.status === 'active') {
    const token = await issueResetToken(db, user.id);
    const url = resetUrlFor(c, token);
    await trySendResetEmail(c, user.email, url);
    await recordAudit(db, {
      actorType: 'user', actorUserId: user.id, action: 'auth.password_reset.requested',
      target: user.email, ip: meta.ip, userAgent: meta.userAgent, metadata: { self_service: true },
    });
  }
  // Always the same response — no account enumeration.
  return success(c, { requested: true });
});
```

`reset-password` handler:

```ts
auth.post('/reset-password', validateJson(resetPasswordSchema), async (c) => {
  const { token, password } = c.get('validated') as ResetPasswordInput;
  const db = c.get('db');
  const meta = requestMeta(c);
  const hash = await sha256Hex(token);
  const rows = await db.select().from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hash)).limit(1);
  const row = rows[0];
  if (!row) throw new ApiException(400, ERROR_CODES.INVALID_TOKEN, 'Invalid or expired reset link');
  if (row.usedAt) throw new ApiException(400, ERROR_CODES.TOKEN_REVOKED, 'This reset link was already used');
  if (new Date(row.expiresAt) <= new Date()) {
    throw new ApiException(400, ERROR_CODES.TOKEN_EXPIRED, 'This reset link has expired');
  }

  const newHash = await hashPassword(password, Number(c.env.BCRYPT_ROUNDS ?? 10));
  await db.update(users)
    .set({ passwordHash: newHash, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date().toISOString() })
    .where(eq(users.id, row.userId));
  await db.update(passwordResetTokens)
    .set({ usedAt: new Date().toISOString() }).where(eq(passwordResetTokens.id, row.id));
  await invalidateUserResetTokens(db, row.userId);
  // Kill all existing sessions: revoke outstanding refresh tokens.
  await db.update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
  await recordAudit(db, {
    actorType: 'user', actorUserId: row.userId, action: 'auth.password_reset.completed',
    ip: meta.ip, userAgent: meta.userAgent,
  });
  return success(c, { reset: true });
});
```

Confirm `isNull` is imported in `auth.ts` (add to the `drizzle-orm` import if missing).

**Step 4 — Run permission test, expect pass:** `pnpm --filter @coursewise/api test passwordReset.permissions`.

**Step 5 — Write DB-gated integration test** (`passwordReset.integration.test.ts`), guarded by `const hasDb = !!process.env.DATABASE_URL;` and `describe.skipIf(!hasDb)`. Model setup on `cou13.integration.test.ts` (env object + `app.request`). Cover, using a seeded user:
- `forgot-password` with a known email → 200 `{ requested: true }`, and a `password_reset_tokens` row now exists for the user.
- `forgot-password` with an unknown email → identical 200, no row.
- full round-trip: read the issued token (query the row, but the plaintext isn't stored — so instead drive `reset-password` via a token issued through `issueResetToken` directly in the test), then `reset-password` → 200; old refresh tokens for that user are `revokedAt`; logging in with the new password succeeds and the old password fails.
- `reset-password` with a bad token → 400 `INVALID_TOKEN`; with an expired token → 400 `TOKEN_EXPIRED`; reusing a used token → 400 `TOKEN_REVOKED`.

**Step 6 — Run:** `pnpm --filter @coursewise/api test passwordReset` (integration cases skip locally without `DATABASE_URL`; the assertions still typecheck).

**Step 7 — Commit:**
```bash
git add apps/api/src/routes/auth.ts apps/api/src/routes/passwordReset.permissions.test.ts apps/api/src/routes/passwordReset.integration.test.ts
git commit -m "feat: forgot-password and reset-password endpoints"
```

---

## Task 6: Admin/teacher endpoint `POST /students/:userId/reset-password-link`

**Files:**
- Modify: `apps/api/src/routes/students.ts`
- Test: extend `apps/api/src/routes/students.permissions.test.ts` (401 case) + add DB-gated cases to a `students.resetLink.integration.test.ts`

**Step 1 — Failing permission test.** Add to `students.permissions.test.ts`:

```ts
it('POST /api/students/<uuid>/reset-password-link → 401 unauthenticated', async () => {
  const res = await app.request(`/api/students/${USER}/reset-password-link`, { method: 'POST' }, env);
  expect(res.status).toBe(401);
});
```

**Step 2 — Run, expect fail.**

**Step 3 — Implement** in `students.ts`. Reuse the `canDeleteStudent` ownership shape as a new `canResetStudentPassword` (admin OR a teacher of a course the student is enrolled in). Add imports for `issueResetToken`, `renderPasswordResetEmail`, `PASSWORD_RESET_TTL_MINUTES`, and a `SendResetLinkResponse` type:

```ts
async function canResetStudentPassword(db: Db, caller: AuthenticatedUser, targetUserId: string): Promise<boolean> {
  if (caller.id === targetUserId) return false;
  if (caller.role === 'admin') return true;
  if (caller.role !== 'teacher') return false;
  const [row] = await db.select({ id: enrollments.id }).from(enrollments)
    .innerJoin(courseTeachers, eq(courseTeachers.courseId, enrollments.courseId))
    .where(and(eq(enrollments.studentId, targetUserId), eq(courseTeachers.teacherId, caller.id)))
    .limit(1);
  return !!row;
}

// POST /api/students/:userId/reset-password-link
r.post('/students/:userId/reset-password-link', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const userId = requireParam(c, 'userId');
  if (!(await canResetStudentPassword(db, auth.user, userId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No reset access to this student');
  }
  const [target] = await db.select({ id: users.id, email: users.email, status: users.status })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'User not found');

  const token = await issueResetToken(db, target.id);
  const origin =
    c.req.header('origin') ??
    (c.req.header('referer') ? new URL(c.req.header('referer')!).origin : null) ??
    (c.env.CORS_ORIGIN && c.env.CORS_ORIGIN !== '*' ? c.env.CORS_ORIGIN : 'http://localhost:5173');
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;

  let emailSent = false;
  if (c.env.SEND_EMAIL) {
    const tmpl = renderPasswordResetEmail({ resetUrl, expiresMinutes: PASSWORD_RESET_TTL_MINUTES });
    try {
      await sendEmailViaCloudflare(c.env.SEND_EMAIL, {
        to: target.email, from: c.env.EMAIL_FROM ?? 'CourseWise <noreply@fsuac.com>',
        subject: tmpl.subject, html: tmpl.html, text: tmpl.text,
      });
      emailSent = true;
    } catch (err) { console.error('admin reset-link: email send failed', { userId, err }); }
  }
  await recordAudit(db, {
    actorType: 'user', actorUserId: auth.user.id, action: 'auth.password_reset.admin_initiated',
    target: target.email, metadata: { emailSent },
  });
  const body: SendResetLinkResponse = { resetUrl, emailSent };
  return success(c, body);
});
```

> Reuse the existing `inviteCreateUrl`-style helper if you prefer to DRY the origin logic into a shared util in `lib/` — optional cleanup, fine to inline.

**Step 4 — Run permission test, expect pass.**

**Step 5 — DB-gated integration cases** (`students.resetLink.integration.test.ts`, `skipIf(!hasDb)`): admin → 200 with `resetUrl` containing `/reset-password?token=` and a token row created; owning teacher → 200; non-owning teacher → 403; student → 403; unknown userId → 404.

**Step 6 — Run:** `pnpm --filter @coursewise/api test students`.

**Step 7 — Commit:**
```bash
git add apps/api/src/routes/students.ts apps/api/src/routes/students.permissions.test.ts apps/api/src/routes/students.resetLink.integration.test.ts
git commit -m "feat: admin/teacher send-reset-link endpoint on student roster"
```

---

## Task 7: Frontend query hooks

**Files:**
- Modify: `apps/web/src/lib/queries.ts`

**Step 1 — Implement** (no separate unit test; covered by page tests + typecheck):

```ts
import type { SendResetLinkResponse } from '@coursewise/shared';

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiCall<{ requested: boolean }>('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      apiCall<{ reset: boolean }>('/api/auth/reset-password', { method: 'POST', body: input }),
  });
}

export function useSendStudentResetLink() {
  return useMutation({
    mutationFn: (userId: string) =>
      apiCall<SendResetLinkResponse>(`/api/students/${userId}/reset-password-link`, { method: 'POST' }),
  });
}
```

Match the exact `apiCall` signature already used in this file (verify whether it's `{ body }` or `{ body: JSON.stringify(...) }` — copy a neighboring mutation).

**Step 2 — Typecheck:** `pnpm --filter @coursewise/web typecheck`.

**Step 3 — Commit:**
```bash
git add apps/web/src/lib/queries.ts
git commit -m "feat: add password-reset query hooks"
```

---

## Task 8: i18n keys (en / zh-CN / fr)

**Files:**
- Modify: `apps/web/src/locales/en.ts`, `zh-CN.ts`, `fr.ts`

**Step 1 — Add a `passwordReset` block** (and any `auth.forgotPassword*` keys) to all three locales. Keys needed by Tasks 9–11:
- `auth.forgotPasswordLink` ("Forgot password?")
- `passwordReset.requestTitle`, `requestSubtitle`, `emailLabel`, `requestCta`, `requestDoneTitle`, `requestDoneBody` (generic "if an account exists…")
- `passwordReset.newTitle`, `newPasswordLabel`, `confirmLabel`, `mismatch`, `submitCta`, `successToast`, `invalidLinkTitle`, `invalidLinkBody`, `requestNewLink`
- `passwordReset.sendLinkCta` (roster icon label), `linkSentToast`, `linkCopyTitle`, `linkCopyBody`, `copyCta`, `copied`

Use real translations for `fr` and `zh-CN` (the repo already maintains full parity — match an existing recent feature's translations for tone).

**Step 2 — Typecheck:** `pnpm --filter @coursewise/web typecheck` (locale objects are typed; missing keys in one locale will error).

**Step 3 — Commit:**
```bash
git add apps/web/src/locales
git commit -m "feat: i18n strings for password reset"
```

---

## Task 9: ForgotPasswordPage + route

**Files:**
- Create: `apps/web/src/pages/ForgotPasswordPage.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1 — Build the page** modeled on `LoginPage.tsx`: one email `Input`, submit calls `useForgotPassword().mutateAsync(email)`. Regardless of success/error, switch to a "check your email" confirmation panel using `passwordReset.requestDone*`. Include a `<Link to="/login">` back. Use `t()` for all copy.

**Step 2 — Register route** in `App.tsx` inside the `<PublicLayout>` block (next to `/login`):

```tsx
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
```

Add the import at the top.

**Step 3 — Typecheck + build:** `pnpm --filter @coursewise/web typecheck`.

**Step 4 — Commit:**
```bash
git add apps/web/src/pages/ForgotPasswordPage.tsx apps/web/src/App.tsx
git commit -m "feat: forgot-password page"
```

---

## Task 10: ResetPasswordPage + route

**Files:**
- Create: `apps/web/src/pages/ResetPasswordPage.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1 — Build the page** modeled on `LoginPage.tsx`:
- Read `token` from `useSearchParams()`. If missing → show the `invalidLink*` state.
- Two password fields (new + confirm); validate they match (`passwordReset.mismatch`) and length ≥ 8 client-side.
- Submit → `useResetPassword().mutateAsync({ token, password })`. On success: `toast` `successToast`, `navigate('/login')`.
- On `ApiClientError` with code `TOKEN_EXPIRED` / `TOKEN_REVOKED` / `INVALID_TOKEN` → show the `invalidLink*` state with a `<Link to="/forgot-password">` (`requestNewLink`). Map other errors to a generic message.

**Step 2 — Register route** in `App.tsx` under `<PublicLayout>`:

```tsx
<Route path="/reset-password" element={<ResetPasswordPage />} />
```

**Step 3 — Typecheck.**

**Step 4 — Commit:**
```bash
git add apps/web/src/pages/ResetPasswordPage.tsx apps/web/src/App.tsx
git commit -m "feat: reset-password page"
```

---

## Task 11: LoginPage "Forgot password?" link

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`

**Step 1 — Add a link** below the password field (before or beside the register link):

```tsx
<Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground">
  {t('auth.forgotPasswordLink')}
</Link>
```

Match the existing `Link` styling already in the file.

**Step 2 — Typecheck.**

**Step 3 — Commit:**
```bash
git add apps/web/src/pages/LoginPage.tsx
git commit -m "feat: link to forgot-password from login"
```

---

## Task 12: Roster action icon + copy-link fallback dialog

**Files:**
- Modify: `apps/web/src/pages/teacher/TeacherStudentsPage.tsx`

**Step 1 — Add the icon.** Import `KeyRound` from `lucide-react` and `useSendStudentResetLink` from `@/lib/queries`. In the roster row action cell (`TeacherStudentsPage.tsx` ~line 743, the `<div className="flex items-center justify-end gap-1.5">`), add a third `ActionIconButton` after the Mail button:

```tsx
<ActionIconButton
  icon={KeyRound}
  label={t('passwordReset.sendLinkCta')}
  color="violet"
  size="sm"
  onClick={() => onSendReset(r)}
/>
```

(Verify `"violet"` is a supported `color` on `ActionIconButton`; if not, pick an existing one not already used in the row.)

**Step 2 — Wire the handler + fallback dialog.** Add state `const [resetLink, setResetLink] = useState<string | null>(null)` and the mutation. `onSendReset(row)` calls `mutateAsync(row.studentId)` (confirm the row's user-id field name — likely `studentId`):

```tsx
const sendReset = useSendStudentResetLink();
const onSendReset = async (row: EnrollmentRow) => {
  try {
    const res = await sendReset.mutateAsync(row.studentId);
    if (res.emailSent) toast.push({ title: t('passwordReset.linkSentToast'), tone: 'success' });
    else setResetLink(res.resetUrl); // open copy dialog
  } catch (err) {
    const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
    toast.push({ title: t(key), tone: 'error' });
  }
};
```

Render a `<Dialog open={!!resetLink} ...>` showing `linkCopyTitle` / `linkCopyBody`, a read-only `Input` with `resetLink`, and a copy `Button` (reuse the page's existing copy pattern around `onCopyInvite` / the `Copy`/`Check` icons already imported). Close clears `resetLink`.

**Step 3 — Typecheck + build:** `pnpm --filter @coursewise/web build`.

**Step 4 — Commit:**
```bash
git add apps/web/src/pages/teacher/TeacherStudentsPage.tsx
git commit -m "feat: send-reset-link action on student roster"
```

---

## Task 13: Mount-check, full verification

**Step 1 — Confirm routing/mounting.** No new API route file was added (handlers live in existing `auth.ts` / `students.ts`, already mounted in `index.ts`), so no `app.route` change is needed. Verify `forgot-password` / `reset-password` are reachable by re-running the permission test.

**Step 2 — Run everything:**
```bash
pnpm -r run typecheck
pnpm -r run lint
pnpm -r run test
pnpm -r run build
```
Expected: typecheck/lint/build clean; tests green (DB-gated integration cases skip without `DATABASE_URL`, matching the pre-existing baseline of API 265 passed / 58 skipped).

**Step 3 — Optional manual DB verification** (if a `DATABASE_URL` / `.env.local` is available): run `pnpm db:migrate`, then exercise the flow with the @verify or @run skill.

**Step 4 — Final commit** if anything was touched during verification, then hand off to finishing-a-development-branch for PR.

---

## Out of scope (YAGNI)

- No new admin Users page (action lives on the existing roster).
- No password-strength meter or breach check (reuses the existing 8–128 char rule).
- No expired-token cleanup cron (rows are harmless; can be added later).
- No SMS / second channel.
