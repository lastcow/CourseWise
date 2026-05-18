import { Hono, type Context } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  type LoginInput,
  type LoginResponse,
  type RefreshInput,
  type RegisterInput,
} from '@coursewise/shared';
import { enrollments, invitationCodes, refreshTokens, studentProfiles, users } from '../db/schema';
import { hashPassword, verifyPassword } from '../services/password';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../services/jwt';
import { sha256Hex } from '../lib/crypto';
import { recordAudit } from '../services/audit';
import { getRateLimiter } from '../services/rateLimit';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { validateJson } from '../middleware/validate';
import { requireJwtAuth } from '../middleware/jwt';
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

async function issueTokens(
  c: Context<AppEnv>,
  user: {
    id: string;
    email: string;
    role: 'admin' | 'teacher' | 'student';
  },
  meta: { ip: string | null; userAgent: string | null },
  familyId?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const db = c.get('db');
  const config = {
    accessSecret: c.env.JWT_SECRET,
    refreshSecret: c.env.JWT_REFRESH_SECRET,
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
  };

  const fid = familyId ?? crypto.randomUUID();
  const jti = crypto.randomUUID();
  const accessToken = await signAccessToken(
    { sub: user.id, email: user.email, role: user.role },
    config,
  );
  const refreshToken = await signRefreshToken({ sub: user.id, fid, jti }, config);
  const tokenHash = await sha256Hex(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash,
    familyId: fid,
    expiresAt,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  return { accessToken, refreshToken };
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

  const tokens = await issueTokens(c, user, meta);

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

  const tokens = await issueTokens(c, user, meta);

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

auth.post('/refresh', validateJson(refreshSchema), async (c) => {
  const input = c.get('validated') as RefreshInput;
  const db = c.get('db');
  const meta = requestMeta(c);
  const config = {
    accessSecret: c.env.JWT_SECRET,
    refreshSecret: c.env.JWT_REFRESH_SECRET,
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
  };

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

  const tokens = await issueTokens(c, user, meta, stored.familyId);

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

  return success(c, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
});

auth.post('/logout', validateJson(refreshSchema), async (c) => {
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

export default auth;
