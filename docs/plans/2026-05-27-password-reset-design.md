# Password Reset — Design

**Date:** 2026-05-27
**Status:** Approved, ready for implementation

## Goal

Two related capabilities:

1. **Self-service forgot password** — a public flow where a user requests a
   reset link by email and sets a new password.
2. **Admin/teacher-initiated reset** — from the student roster page, an admin
   (or the student's own course teacher) can send a reset link to a student,
   with a copyable-link fallback when email delivery fails.

The design mirrors the existing **teacher invitations** feature, which already
solves the same shape of problem: hash-only token storage, best-effort email
with a copy-link fallback, and origin-based URL building.

## Decisions

- **Enumeration-safe:** `forgot-password` always returns the same response
  whether or not the email exists.
- **Delivery:** email + copyable link (the admin flow returns the raw link so
  it can be copied if the email send fails).
- **Authorization for the admin flow:** admins, plus the student's own course
  teacher (reusing the existing `canDeleteStudent`-style ownership check).
- **Token TTL:** 1 hour, single-use.

## Data model

New table `password_reset_tokens` (mirrors `teacherInvitations`):

| column      | notes                                          |
|-------------|------------------------------------------------|
| `id`        | uuid PK                                         |
| `userId`    | FK → `users`, `onDelete: cascade`               |
| `tokenHash` | SHA-256 of plaintext token, unique index        |
| `expiresAt` | timestamp, 1-hour TTL                           |
| `usedAt`    | nullable — single-use marker                    |
| `createdAt` | timestamp                                       |

The plaintext token is never persisted — only its hash, like `refreshTokens`
and `teacherInvitations`.

## Services

**`services/passwordReset.ts`**
- `generateResetToken()` → `{ plaintext, hash }` via `randomBase62(48)` +
  `sha256Hex()` (from `lib/crypto.ts`).
- `PASSWORD_RESET_TTL_MINUTES = 60`.
- `invalidateUserResetTokens(db, userId)` — marks prior unused tokens used, so
  only the latest link works.

**`services/passwordResetEmail.ts`**
- `renderPasswordResetEmail({ resetUrl, expiresMinutes })` →
  `{ subject, html, text }`. Table-based HTML + plain-text fallback, same shape
  as `teacherInvitationEmail.ts`.

## Token lifecycle on successful reset

1. Look up by `tokenHash`; require `usedAt` null and not expired.
2. Bcrypt-hash the new password → update `users.passwordHash`.
3. Mark token `usedAt`; invalidate sibling tokens.
4. Revoke all the user's refresh tokens (kills other sessions); clear
   `failedLoginCount` / `lockedUntil`.

## API endpoints

### Public (no auth) — `routes/auth.ts`

**`POST /api/auth/forgot-password`** — body `{ email }`
- Always returns the same 200 ("if an account exists, we've sent a link").
- If a matching **active** user exists: issue token, store hash, send email
  best-effort (never blocks the response).
- Rate-limited per-email and per-IP, reusing the helper already used by `/login`.

**`POST /api/auth/reset-password`** — body `{ token, password }`
- Runs the token lifecycle above.
- Distinct error codes for invalid / expired / already-used so the UI can show
  "this link is no longer valid".

### Admin/teacher — `routes/students.ts`

**`POST /api/students/:userId/reset-password-link`**
- Gate: `caller.role === 'admin'` OR the caller teaches a course the target is
  enrolled in (reuse the `canDeleteStudent` ownership pattern). Else **403**.
- Target user must exist.
- Issue token, build reset URL from request origin (fall back to
  `CORS_ORIGIN`), send email best-effort.
- Returns `{ resetUrl, emailSent }`.

## Shared validation (`packages/shared`)

- `forgotPasswordSchema` `{ email }`
- `resetPasswordSchema` `{ token, password }` (reuses the 8–128 char
  `passwordSchema`)
- Response types for the three endpoints.

## Frontend

**Public pages + routes**
- `ForgotPasswordPage.tsx` (`/forgot-password`): email field →
  `useForgotPassword()`; always lands on the same confirmation state.
- `ResetPasswordPage.tsx` (`/reset-password?token=…`): new-password + confirm →
  `useResetPassword()`; success redirects to `/login` with a toast; invalid /
  expired token shows a "request a new link" state.
- `LoginPage.tsx`: add a "Forgot password?" link.

**Roster action icon** — `TeacherStudentsPage.tsx`
- A third `ActionIconButton` (`KeyRound`) beside Edit/Message →
  `useSendStudentResetLink(userId)`.
- `emailSent: true` → success toast.
- `emailSent: false` → small dialog showing `resetUrl` with a copy button
  (mirrors the teacher-invitation copy-link fallback).

**Queries** (`lib/queries.ts`): `useForgotPassword`, `useResetPassword`,
`useSendStudentResetLink`.

**i18n**: new `t()` keys added to all three locales — `en`, `zh-CN`, `fr`.

## Security

- Hash-only token storage; 1-hour single-use expiry; sibling-token invalidation.
- Refresh-token revocation + lockout reset on use.
- Enumeration-safe forgot-password; per-email and per-IP rate limiting.
- Authoritative server-side authorization on the admin endpoint; client only
  controls icon visibility.
- Reset link uses request origin, falls back to `CORS_ORIGIN`.

## Testing (TDD, following `*.integration.test.ts` patterns)

- **Unit:** token generation; email render.
- **Integration:**
  - forgot-password: existing / unknown / inactive all return identical 200.
  - reset-password: valid, expired, used, bad token.
  - refresh tokens revoked after a reset.
  - admin reset-link: admin ✓, owning teacher ✓, non-owning teacher 403,
    student 403.
