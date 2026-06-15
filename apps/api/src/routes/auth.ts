import { Hono, type Context } from 'hono';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  registerTeacherSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type LoginResponse,
  type RefreshInput,
  type RegisterInput,
  type RegisterTeacherInput,
  type ResetPasswordInput,
  type TeacherInvitationLookup,
} from '@coursewise/shared';
import {
  enrollments,
  invitationCodes,
  passwordResetTokens,
  refreshTokens,
  studentProfiles,
  teacherInvitations,
  teacherProfiles,
  users,
} from '../db/schema';
import { hashPassword, verifyPassword } from '../services/password';
import { ACCESS_TOKEN_TTL_SECONDS, verifyRefreshToken } from '../services/jwt';
import { issueTokens } from '../services/tokens';
import {
  invalidateUserResetTokens,
  issueResetToken,
  PASSWORD_RESET_TTL_MINUTES,
} from '../services/passwordReset';
import { renderPasswordResetEmail } from '../services/passwordResetEmail';
import { sendEmailViaCloudflare, DEFAULT_EMAIL_FROM } from '../services/email';
import { sha256Hex } from '../lib/crypto';
import { recordAudit } from '../services/audit';
import { getRateLimiter } from '../services/rateLimit';
import { deriveInvitationStatus } from '../services/teacherInvitations';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { validateJson } from '../middleware/validate';
import { requireJwtAuth } from '../middleware/jwt';
import { requireAuth } from '../middleware/auth';
import { requireParam } from '../lib/params';
import { resolveRequestOrigin } from '../lib/requestOrigin';
import type { AppEnv } from '../types';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

const auth = new Hono<AppEnv>();

function requestMeta(c: Context<AppEnv>) {
  return {
    ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  };
}

function jwtConfig(c: Context<AppEnv>) {
  return {
    accessSecret: c.env.JWT_SECRET,
    refreshSecret: c.env.JWT_REFRESH_SECRET,
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
  };
}

async function issueTokensForContext(
  c: Context<AppEnv>,
  user: { id: string; email: string; role: 'admin' | 'teacher' | 'student' },
  meta: { ip: string | null; userAgent: string | null },
  familyId?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  return issueTokens({
    db: c.get('db'),
    user,
    meta,
    familyId,
    config: jwtConfig(c),
  });
}

function resetUrlFor(c: Context<AppEnv>, token: string): string {
  return `${resolveRequestOrigin(c)}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Best-effort: dispatch the password-reset email via the Cloudflare Email
 * Service binding. Never throws — a send failure must not change the response
 * (enumeration-safe) and the token is already persisted regardless.
 */
async function trySendResetEmail(
  c: Context<AppEnv>,
  to: string,
  resetUrl: string,
): Promise<boolean> {
  if (!c.env.SEND_EMAIL) return false;
  const tmpl = renderPasswordResetEmail({ resetUrl, expiresMinutes: PASSWORD_RESET_TTL_MINUTES });
  try {
    await sendEmailViaCloudflare(c.env.SEND_EMAIL, {
      to,
      from: c.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
    });
    return true;
  } catch (err) {
    console.error('password-reset: email send failed', { to, err });
    return false;
  }
}

auth.post('/register-student', validateJson(registerSchema), async (c) => {
  const input = c.get('validated') as RegisterInput;
  const db = c.get('db');
  const meta = requestMeta(c);

  const limiter = getRateLimiter(c.env.RATE_LIMIT_KV);
  const rl = await limiter.consume(`register:${meta.ip ?? 'anon'}`, 10, 60);
  if (!rl.allowed) {
    throw new ApiException(429, ERROR_CODES.RATE_LIMITED, 'Too many attempts');
  }

  const codeRows = await db
    .select()
    .from(invitationCodes)
    .where(sql`lower(${invitationCodes.code}) = lower(${input.invitationCode})`)
    .limit(1);
  const code = codeRows[0];
  if (!code || code.status !== 'active') {
    throw new ApiException(400, ERROR_CODES.INVALID_INVITATION, 'Invitation code not valid');
  }
  if (code.expiresAt && new Date(code.expiresAt) <= new Date()) {
    throw new ApiException(400, ERROR_CODES.INVALID_INVITATION, 'Invitation code expired');
  }
  if (code.maxUses !== null && code.usedCount >= code.maxUses) {
    throw new ApiException(400, ERROR_CODES.INVALID_INVITATION, 'Invitation code exhausted');
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${input.email})`)
    .limit(1);
  if (existing.length > 0) {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Email already registered');
  }

  const rounds = Number(c.env.BCRYPT_ROUNDS ?? '10') || 10;
  const passwordHash = await hashPassword(input.password, rounds);

  const inserted = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash,
      name: input.name,
      role: 'student',
      status: 'active',
    })
    .returning();
  const user = inserted[0];
  if (!user) {
    throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create user');
  }

  await db.insert(studentProfiles).values({ userId: user.id });

  // Auto-enroll when the invitation code is tied to a course.
  if (code.courseId) {
    const existingEnrollment = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, code.courseId), eq(enrollments.studentId, user.id)))
      .limit(1);
    if (existingEnrollment.length === 0) {
      await db.insert(enrollments).values({
        courseId: code.courseId,
        studentId: user.id,
        status: 'enrolled',
      });
    }
  }

  await db
    .update(invitationCodes)
    .set({
      usedCount: code.usedCount + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(invitationCodes.id, code.id));

  const tokens = await issueTokensForContext(c, user, meta);

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: user.id,
    action: 'auth.register-student',
    target: code.courseId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { invitationCodeId: code.id },
  });

  const body: LoginResponse = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
    },
  };
  return success(c, body, 201);
});

auth.post('/login', validateJson(loginSchema), async (c) => {
  const input = c.get('validated') as LoginInput;
  const db = c.get('db');
  const meta = requestMeta(c);

  const limiter = getRateLimiter(c.env.RATE_LIMIT_KV);
  const rl = await limiter.consume(`login:${input.email}`, 10, 60);
  if (!rl.allowed) {
    throw new ApiException(429, ERROR_CODES.RATE_LIMITED, 'Too many login attempts');
  }

  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${input.email})`)
    .limit(1);
  const user = rows[0];

  if (!user) {
    await recordAudit(db, {
      actorType: 'system',
      action: 'auth.login.failure',
      target: input.email,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: 'unknown_email' },
    });
    throw new ApiException(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    throw new ApiException(423, ERROR_CODES.ACCOUNT_LOCKED, 'Account temporarily locked');
  }

  if (user.status !== 'active') {
    throw new ApiException(403, ERROR_CODES.ACCOUNT_INACTIVE, 'Account is not active');
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const update: {
      failedLoginCount: number;
      lockedUntil?: string | null;
      updatedAt: string;
    } = {
      failedLoginCount: failed,
      updatedAt: new Date().toISOString(),
    };
    if (failed >= LOCKOUT_THRESHOLD) {
      update.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }
    await db.update(users).set(update).where(eq(users.id, user.id));
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: user.id,
      action: 'auth.login.failure',
      target: user.email,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { failed_count: failed, locked: failed >= LOCKOUT_THRESHOLD },
    });
    throw new ApiException(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  await db
    .update(users)
    .set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  const tokens = await issueTokensForContext(c, user, meta);

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: user.id,
    action: 'auth.login.success',
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const body: LoginResponse = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
    },
  };
  return success(c, body);
});

// Enumeration-safe: always returns the same { requested: true } body whether or
// not the email maps to an active account. Rate-limited per email and per IP.
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

  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  const user = rows[0];
  if (user && user.status === 'active') {
    const token = await issueResetToken(db, user.id);
    const url = resetUrlFor(c, token);
    await trySendResetEmail(c, user.email, url);
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: user.id,
      action: 'auth.password_reset.requested',
      target: user.email,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { self_service: true },
    });
  }
  // Always the same response — no account enumeration.
  return success(c, { requested: true });
});

auth.post('/reset-password', validateJson(resetPasswordSchema), async (c) => {
  const { token, password } = c.get('validated') as ResetPasswordInput;
  const db = c.get('db');
  const meta = requestMeta(c);
  const hash = await sha256Hex(token);
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new ApiException(400, ERROR_CODES.INVALID_TOKEN, 'Invalid or expired reset link');
  }
  if (row.usedAt) {
    throw new ApiException(400, ERROR_CODES.TOKEN_REVOKED, 'This reset link was already used');
  }
  if (new Date(row.expiresAt) <= new Date()) {
    throw new ApiException(400, ERROR_CODES.TOKEN_EXPIRED, 'This reset link has expired');
  }

  const rounds = Number(c.env.BCRYPT_ROUNDS ?? '10') || 10;
  const newHash = await hashPassword(password, rounds);
  await db
    .update(users)
    .set({
      passwordHash: newHash,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, row.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(passwordResetTokens.id, row.id));
  await invalidateUserResetTokens(db, row.userId);
  // Kill all existing sessions: revoke outstanding refresh tokens.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
  await recordAudit(db, {
    actorType: 'user',
    actorUserId: row.userId,
    action: 'auth.password_reset.completed',
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return success(c, { reset: true });
});

auth.post('/refresh', validateJson(refreshSchema), async (c) => {
  const input = c.get('validated') as RefreshInput;
  const db = c.get('db');
  const meta = requestMeta(c);
  const config = jwtConfig(c);

  let payload;
  try {
    payload = await verifyRefreshToken(input.refreshToken, config);
  } catch {
    throw new ApiException(401, ERROR_CODES.INVALID_TOKEN, 'Invalid refresh token');
  }

  const hash = await sha256Hex(input.refreshToken);
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hash))
    .limit(1);
  const stored = rows[0];
  if (!stored) {
    throw new ApiException(401, ERROR_CODES.INVALID_TOKEN, 'Refresh token not found');
  }
  if (stored.revokedAt) {
    // Possible reuse — revoke the whole family.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(
        and(eq(refreshTokens.userId, stored.userId), eq(refreshTokens.familyId, stored.familyId)),
      );
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: stored.userId,
      action: 'auth.refresh.reuse_detected',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { familyId: stored.familyId },
    });
    throw new ApiException(401, ERROR_CODES.TOKEN_REVOKED, 'Refresh token already used');
  }
  if (new Date(stored.expiresAt) <= new Date()) {
    throw new ApiException(401, ERROR_CODES.TOKEN_EXPIRED, 'Refresh token expired');
  }

  const userRows = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  const user = userRows[0];
  if (!user || user.status !== 'active') {
    throw new ApiException(401, ERROR_CODES.UNAUTHORIZED, 'User unavailable');
  }

  const tokens = await issueTokensForContext(c, user, meta, stored.familyId);

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(refreshTokens.id, stored.id));

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: user.id,
    action: 'auth.refresh',
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  // Return the user alongside the rotated tokens (same shape as login). The
  // client persists this profile; omitting it left the stored `user` undefined
  // on a "stay signed in" refresh, which blanked the SPA and then bounced to
  // /login on reload. Typed as LoginResponse so the field stays compiler-enforced.
  const body: LoginResponse = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
    },
  };
  return success(c, body);
});

auth.post('/logout', requireAuth, validateJson(refreshSchema), async (c) => {
  const input = c.get('validated') as RefreshInput;
  const db = c.get('db');
  const meta = requestMeta(c);

  const hash = await sha256Hex(input.refreshToken);
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hash))
    .limit(1);
  const stored = rows[0];
  if (stored && !stored.revokedAt) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(
        and(eq(refreshTokens.userId, stored.userId), eq(refreshTokens.familyId, stored.familyId)),
      );
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: stored.userId,
      action: 'auth.logout',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  return success(c, { ok: true });
});

auth.get('/me', requireJwtAuth, (c) => {
  const a = c.get('auth');
  return success(c, { user: a.user });
});

// Public lookup for a teacher invitation token. Rate-limited per IP.
auth.get('/teacher-invitations/:token', async (c) => {
  const token = requireParam(c, 'token');
  const meta = requestMeta(c);
  const limiter = getRateLimiter(c.env.RATE_LIMIT_KV);
  const rl = await limiter.consume(`teacher-invite-lookup:${meta.ip ?? 'anon'}`, 30, 60);
  if (!rl.allowed) {
    throw new ApiException(429, ERROR_CODES.RATE_LIMITED, 'Too many lookups');
  }
  const db = c.get('db');
  const tokenHash = await sha256Hex(token);
  const rows = await db
    .select({ inv: teacherInvitations, inviter: users })
    .from(teacherInvitations)
    .innerJoin(users, eq(teacherInvitations.invitedByUserId, users.id))
    .where(eq(teacherInvitations.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new ApiException(404, ERROR_CODES.INVALID_INVITATION, 'Invitation not found');
  }
  const status = deriveInvitationStatus(row.inv);
  if (status === 'revoked') {
    throw new ApiException(410, ERROR_CODES.INVITATION_REVOKED, 'Invitation has been revoked');
  }
  if (status === 'accepted') {
    throw new ApiException(410, ERROR_CODES.INVITATION_ACCEPTED, 'Invitation already accepted');
  }
  if (status === 'expired') {
    throw new ApiException(410, ERROR_CODES.INVITATION_EXPIRED, 'Invitation has expired');
  }
  const body: TeacherInvitationLookup = {
    email: row.inv.email,
    expiresAt: row.inv.expiresAt,
    inviterName: row.inviter.name,
  };
  return success(c, body);
});

auth.post('/register-teacher', validateJson(registerTeacherSchema), async (c) => {
  const input = c.get('validated') as RegisterTeacherInput;
  const db = c.get('db');
  const meta = requestMeta(c);

  const limiter = getRateLimiter(c.env.RATE_LIMIT_KV);
  const rl = await limiter.consume(`register-teacher:${meta.ip ?? 'anon'}`, 5, 60);
  if (!rl.allowed) {
    throw new ApiException(429, ERROR_CODES.RATE_LIMITED, 'Too many attempts');
  }

  const tokenHash = await sha256Hex(input.token);
  const rows = await db
    .select()
    .from(teacherInvitations)
    .where(eq(teacherInvitations.tokenHash, tokenHash))
    .limit(1);
  const invitation = rows[0];
  if (!invitation) {
    throw new ApiException(400, ERROR_CODES.INVALID_INVITATION, 'Invitation not valid');
  }
  const status = deriveInvitationStatus(invitation);
  if (status === 'revoked') {
    throw new ApiException(410, ERROR_CODES.INVITATION_REVOKED, 'Invitation has been revoked');
  }
  if (status === 'accepted') {
    throw new ApiException(410, ERROR_CODES.INVITATION_ACCEPTED, 'Invitation already accepted');
  }
  if (status === 'expired') {
    throw new ApiException(410, ERROR_CODES.INVITATION_EXPIRED, 'Invitation has expired');
  }

  const existingUser = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${invitation.email})`)
      .limit(1)
  )[0];
  if (existingUser) {
    throw new ApiException(
      409,
      ERROR_CODES.EMAIL_ALREADY_USER,
      'A user with that email already exists',
    );
  }

  const rounds = Number(c.env.BCRYPT_ROUNDS ?? '10') || 10;
  const passwordHash = await hashPassword(input.password, rounds);

  const inserted = (
    await db
      .insert(users)
      .values({
        email: invitation.email,
        passwordHash,
        name: input.name,
        role: 'teacher',
        status: 'active',
      })
      .returning()
  )[0];
  if (!inserted) {
    throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create user');
  }

  await db.insert(teacherProfiles).values({ userId: inserted.id });

  const nowIso = new Date().toISOString();
  await db
    .update(teacherInvitations)
    .set({
      acceptedAt: nowIso,
      acceptedUserId: inserted.id,
      updatedAt: nowIso,
    })
    .where(eq(teacherInvitations.id, invitation.id));

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: inserted.id,
    action: 'teacher-invitation.accept',
    target: invitation.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { invitedByUserId: invitation.invitedByUserId },
  });

  const tokens = await issueTokensForContext(c, inserted, meta);

  const body: LoginResponse = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      id: inserted.id,
      email: inserted.email,
      name: inserted.name,
      role: inserted.role,
      status: inserted.status,
      preferredLanguage: inserted.preferredLanguage,
    },
  };
  return success(c, body, 201);
});

export default auth;
