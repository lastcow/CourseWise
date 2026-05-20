import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import {
  createInvitationCodeSchema,
  invitationCodeStringSchema,
  updateInvitationCodeSchema,
  validateInvitationCodeSchema,
  type CreateInvitationCodeInput,
  type InvitationCodeSummary,
  type UpdateInvitationCodeInput,
  type ValidateInvitationCodeInput,
  type ValidateInvitationCodeResponse,
} from '@coursewise/shared';
import { courses, invitationCodes } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth, requireCourseTeacher, requireRole } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canWriteCourse, isCourseTeacher } from '../services/courseAccess';
import { getRateLimiter } from '../services/rateLimit';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

function toSummary(
  row: typeof invitationCodes.$inferSelect,
  courseTitle?: string | null,
): InvitationCodeSummary {
  return {
    id: row.id,
    code: row.code,
    courseId: row.courseId ?? null,
    courseTitle: courseTitle ?? null,
    maxUses: row.maxUses ?? null,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt ?? null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Authenticated routes start here.
r.use('*', requireAuth);

// Validate an invitation code (for the public registration page).
// Rate-limited per IP. Requires Bearer auth (JWT or API token) per COU-17 lockdown;
// the registration form now relies on submit-time validation in /api/auth/register-student.
r.post('/invitation-codes/validate', validateJson(validateInvitationCodeSchema), async (c) => {
  const input = c.get('validated') as ValidateInvitationCodeInput;
  const limiter = getRateLimiter(c.env.RATE_LIMIT_KV);
  const callerIp = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'anon';
  const rl = await limiter.consume(`invite-validate:${callerIp}`, 5, 60);
  if (!rl.allowed) {
    throw new ApiException(429, ERROR_CODES.RATE_LIMITED, 'Too many attempts');
  }
  const db = c.get('db');
  const rows = await db
    .select({ ic: invitationCodes, course: courses })
    .from(invitationCodes)
    .leftJoin(courses, eq(invitationCodes.courseId, courses.id))
    .where(sql`lower(${invitationCodes.code}) = lower(${input.code})`)
    .limit(1);
  const row = rows[0];
  const respond = (body: ValidateInvitationCodeResponse) => success(c, body);
  if (!row) return respond({ valid: false });
  const code = row.ic;
  if (code.status !== 'active') return respond({ valid: false });
  if (code.expiresAt && new Date(code.expiresAt) <= new Date()) return respond({ valid: false });
  if (code.maxUses !== null && code.usedCount >= code.maxUses) return respond({ valid: false });
  return respond({ valid: true, courseTitle: row.course?.title ?? null });
});

// List invitation codes — admin only (creators may also see via scope).
r.get(
  '/invitation-codes',
  requireScopeGroup('invitationCodesRead'),
  requireRole('admin'),
  async (c) => {
    const db = c.get('db');
    const rows = await db
      .select({ ic: invitationCodes, course: courses })
      .from(invitationCodes)
      .leftJoin(courses, eq(invitationCodes.courseId, courses.id))
      .orderBy(desc(invitationCodes.createdAt));
    return success(
      c,
      rows.map(({ ic, course }) => toSummary(ic, course?.title ?? null)),
    );
  },
);

r.get(
  '/invitation-codes/:id',
  requireScopeGroup('invitationCodesRead'),
  requireRole('admin'),
  async (c) => {
    const db = c.get('db');
    const id = requireParam(c, 'id');
    const row = (
      await db
        .select({ ic: invitationCodes, course: courses })
        .from(invitationCodes)
        .leftJoin(courses, eq(invitationCodes.courseId, courses.id))
        .where(eq(invitationCodes.id, id))
        .limit(1)
    )[0];
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Invitation code not found');
    return success(c, toSummary(row.ic, row.course?.title ?? null));
  },
);

r.post(
  '/invitation-codes',
  requireScopeGroup('invitationCodesWrite'),
  requireRole('admin'),
  validateJson(createInvitationCodeSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const input = c.get('validated') as CreateInvitationCodeInput;

    let code = input.code;
    if (!code) {
      // Generate a unique-ish code like INV-XXXX-XXXX (8 chars base32).
      const buf = new Uint8Array(8);
      crypto.getRandomValues(buf);
      const alphabet = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';
      const body = [...buf].map((b) => alphabet[b % alphabet.length]).join('');
      code = `INV-${body.slice(0, 4)}-${body.slice(4, 8)}`;
    }
    const parsedCode = invitationCodeStringSchema.parse(code);

    if (input.courseId) {
      const course = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, input.courseId))
        .limit(1);
      if (course.length === 0) {
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'courseId does not exist');
      }
    }

    // unique check (lower)
    const existing = await db
      .select({ id: invitationCodes.id })
      .from(invitationCodes)
      .where(sql`lower(${invitationCodes.code}) = lower(${parsedCode})`)
      .limit(1);
    if (existing.length > 0) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Invitation code already exists');
    }

    const [inserted] = await db
      .insert(invitationCodes)
      .values({
        code: parsedCode,
        courseId: input.courseId ?? null,
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresAt ?? null,
        status: 'active',
        createdById: auth.user.id,
      })
      .returning();
    if (!inserted)
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create invitation code');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'invitation.create',
      target: inserted.id,
      metadata: { code: parsedCode },
    });

    return success(c, toSummary(inserted, null), 201);
  },
);

r.patch(
  '/invitation-codes/:id',
  requireScopeGroup('invitationCodesWrite'),
  requireRole('admin'),
  validateJson(updateInvitationCodeSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'id');
    const input = c.get('validated') as UpdateInvitationCodeInput;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.courseId !== undefined) patch.courseId = input.courseId;
    if (input.maxUses !== undefined) patch.maxUses = input.maxUses;
    if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt;
    if (input.status !== undefined) patch.status = input.status;

    const [updated] = await db
      .update(invitationCodes)
      .set(patch)
      .where(eq(invitationCodes.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Invitation code not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'invitation.update',
      target: id,
      metadata: { fields: Object.keys(patch) },
    });
    return success(c, toSummary(updated, null));
  },
);

r.post('/invitation-codes/:id/deactivate', requireScopeGroup('invitationCodesWrite'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'id');

  // Admin can deactivate any code; teachers can deactivate codes scoped to
  // a course they teach. Codes without a course remain admin-only.
  if (auth.user.role !== 'admin') {
    const [row] = await db
      .select({ courseId: invitationCodes.courseId })
      .from(invitationCodes)
      .where(eq(invitationCodes.id, id))
      .limit(1);
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Invitation code not found');
    if (!row.courseId || !(await isCourseTeacher(db, row.courseId, auth.user.id))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this invitation code');
    }
  }

  const [updated] = await db
    .update(invitationCodes)
    .set({ status: 'revoked', updatedAt: new Date().toISOString() })
    .where(eq(invitationCodes.id, id))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Invitation code not found');

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'invitation.deactivate',
    target: id,
  });
  return success(c, toSummary(updated, null));
});

// -------- Course-scoped routes (teacher access) --------

// List invitation codes for a course. Admin or a teacher of the course.
r.get(
  '/courses/:courseId/invitation-codes',
  requireScopeGroup('invitationCodesRead'),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (auth.user.role !== 'admin') {
      if (auth.user.role !== 'teacher' || !(await isCourseTeacher(db, courseId, auth.user.id))) {
        throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
      }
    }
    const rows = await db
      .select({ ic: invitationCodes, course: courses })
      .from(invitationCodes)
      .leftJoin(courses, eq(invitationCodes.courseId, courses.id))
      .where(eq(invitationCodes.courseId, courseId))
      .orderBy(desc(invitationCodes.createdAt));
    return success(
      c,
      rows.map(({ ic, course }) => toSummary(ic, course?.title ?? null)),
    );
  },
);

// Create an invitation code scoped to a course. Server forces the courseId
// from the URL — body `courseId`, if any, is ignored. Admin OR a teacher of
// the course can call.
r.post(
  '/courses/:courseId/invitation-codes',
  requireScopeGroup('invitationCodesWrite'),
  requireCourseTeacher(),
  validateJson(createInvitationCodeSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    // canWriteCourse covers admin + course teacher; requireCourseTeacher
    // middleware above already gates teachers, but we keep this for token
    // callers that may have invitationCodesWrite without being teachers.
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateInvitationCodeInput;

    let code = input.code;
    if (!code) {
      const buf = new Uint8Array(8);
      crypto.getRandomValues(buf);
      const alphabet = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';
      const body = [...buf].map((b) => alphabet[b % alphabet.length]).join('');
      code = `INV-${body.slice(0, 4)}-${body.slice(4, 8)}`;
    }
    const parsedCode = invitationCodeStringSchema.parse(code);

    const existing = await db
      .select({ id: invitationCodes.id })
      .from(invitationCodes)
      .where(sql`lower(${invitationCodes.code}) = lower(${parsedCode})`)
      .limit(1);
    if (existing.length > 0) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Invitation code already exists');
    }

    const [inserted] = await db
      .insert(invitationCodes)
      .values({
        code: parsedCode,
        courseId,
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresAt ?? null,
        status: 'active',
        createdById: auth.user.id,
      })
      .returning();
    if (!inserted) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create invitation code');
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'invitation.create',
      target: inserted.id,
      metadata: { code: parsedCode, courseId },
    });

    return success(c, toSummary(inserted, null), 201);
  },
);

export default r;
