import { Hono, type Context } from 'hono';
import { and, asc, count, desc, eq, gt, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import {
  createTeacherInvitationSchema,
  listTeacherInvitationsQuerySchema,
  type CreatedTeacherInvitation,
  type CreateTeacherInvitationInput,
  type ListTeacherInvitationsQuery,
  type TeacherInvitationStatus,
  type TeacherInvitationSummary,
  type TeacherSummary,
} from '@coursewise/shared';
import { courseTeachers, teacherInvitations, users } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import {
  buildInviteUrl,
  expiresAtFromNow,
  generateInvitationToken,
  toInvitationSummary,
} from '../services/teacherInvitations';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

r.use('*', requireAuth, requireRole('admin'));

function inviteCreateUrl(c: Context<AppEnv>, token: string): string {
  // Prefer the request's own origin so the invite link points back at the
  // browser the admin is using; fall back to CORS_ORIGIN, which the operator
  // sets to the canonical web URL.
  const originHeader = c.req.header('origin');
  const referer = c.req.header('referer');
  let base: string | null = null;
  if (originHeader) base = originHeader;
  else if (referer) {
    try {
      base = new URL(referer).origin;
    } catch {
      base = null;
    }
  } else if (c.env.CORS_ORIGIN && c.env.CORS_ORIGIN !== '*') {
    base = c.env.CORS_ORIGIN;
  }
  return buildInviteUrl(token, base);
}

async function loadInviterName(db: ReturnType<typeof getDb>, id: string): Promise<string> {
  const row = (
    await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1)
  )[0];
  return row?.name ?? 'Administrator';
}

function getDb(c: Context<AppEnv>) {
  return c.get('db');
}

function statusFilter(status: TeacherInvitationStatus | undefined, nowIso: string) {
  switch (status) {
    case 'pending':
      return and(
        isNull(teacherInvitations.acceptedAt),
        isNull(teacherInvitations.revokedAt),
        gt(teacherInvitations.expiresAt, nowIso),
      );
    case 'accepted':
      return isNotNull(teacherInvitations.acceptedAt);
    case 'revoked':
      return and(isNull(teacherInvitations.acceptedAt), isNotNull(teacherInvitations.revokedAt));
    case 'expired':
      return and(
        isNull(teacherInvitations.acceptedAt),
        isNull(teacherInvitations.revokedAt),
        lte(teacherInvitations.expiresAt, nowIso),
      );
    default:
      return undefined;
  }
}

r.get('/teacher-invitations', async (c) => {
  const db = c.get('db');
  const queryRaw = {
    status: c.req.query('status'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  };
  const parsed = listTeacherInvitationsQuerySchema.safeParse(queryRaw);
  if (!parsed.success) {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid query parameters');
  }
  const query: ListTeacherInvitationsQuery = parsed.data;
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const nowIso = new Date().toISOString();
  const where = statusFilter(query.status, nowIso);

  const rows = await db
    .select({ inv: teacherInvitations, inviter: users })
    .from(teacherInvitations)
    .innerJoin(users, eq(teacherInvitations.invitedByUserId, users.id))
    .where(where ?? sql`true`)
    .orderBy(desc(teacherInvitations.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalRow = (
    await db
      .select({ count: count() })
      .from(teacherInvitations)
      .where(where ?? sql`true`)
  )[0];

  const items: TeacherInvitationSummary[] = rows.map(({ inv, inviter }) =>
    toInvitationSummary(inv, inviter.name),
  );

  return success(c, {
    items,
    page,
    pageSize,
    total: totalRow?.count ?? items.length,
  });
});

r.get('/teachers', async (c) => {
  const db = c.get('db');
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      courseCount: count(courseTeachers.id),
    })
    .from(users)
    .leftJoin(courseTeachers, eq(courseTeachers.teacherId, users.id))
    .where(and(eq(users.role, 'teacher'), eq(users.status, 'active')))
    .groupBy(users.id)
    .orderBy(asc(users.name));
  const items: TeacherSummary[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    courseCount: Number(row.courseCount ?? 0),
    createdAt: row.createdAt,
  }));
  return success(c, items);
});

r.post('/teacher-invitations', validateJson(createTeacherInvitationSchema), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const input = c.get('validated') as CreateTeacherInvitationInput;

  // Reject if an active user already exists for this email.
  const existingUser = (
    await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${input.email})`)
      .limit(1)
  )[0];
  if (existingUser && existingUser.status !== 'inactive') {
    throw new ApiException(
      409,
      ERROR_CODES.EMAIL_ALREADY_USER,
      'A user with that email already exists',
    );
  }

  // Revoke any existing pending invitation for the email so we can re-issue.
  const pending = (
    await db
      .select()
      .from(teacherInvitations)
      .where(
        and(
          sql`lower(${teacherInvitations.email}) = lower(${input.email})`,
          isNull(teacherInvitations.acceptedAt),
          isNull(teacherInvitations.revokedAt),
        ),
      )
      .limit(1)
  )[0];
  if (pending) {
    const nowIso = new Date().toISOString();
    await db
      .update(teacherInvitations)
      .set({ revokedAt: nowIso, updatedAt: nowIso })
      .where(eq(teacherInvitations.id, pending.id));
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'teacher-invitation.revoke',
      target: pending.id,
      metadata: { reason: 'reissued' },
    });
  }

  const { plaintext, hash } = await generateInvitationToken();
  const expiresAt = expiresAtFromNow();

  const inserted = (
    await db
      .insert(teacherInvitations)
      .values({
        email: input.email,
        invitedByUserId: auth.user.id,
        tokenHash: hash,
        expiresAt,
      })
      .returning()
  )[0];
  if (!inserted) {
    throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create invitation');
  }

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'teacher-invitation.create',
    target: inserted.id,
    metadata: { email: input.email, name: input.name ?? null },
  });

  const inviteUrl = inviteCreateUrl(c, plaintext);
  if (c.env.ENVIRONMENT !== 'production') {
    console.log(`[teacher-invitation] ${input.email} → ${inviteUrl}`);
  }
  const summary = toInvitationSummary(inserted, auth.user.name);
  const body: CreatedTeacherInvitation = {
    ...summary,
    token: plaintext,
    inviteUrl,
  };
  return success(c, body, 201);
});

r.post('/teacher-invitations/:id/revoke', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'id');
  const row = (
    await db.select().from(teacherInvitations).where(eq(teacherInvitations.id, id)).limit(1)
  )[0];
  if (!row) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Invitation not found');
  }
  if (row.acceptedAt) {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Invitation already accepted');
  }
  if (!row.revokedAt) {
    const nowIso = new Date().toISOString();
    await db
      .update(teacherInvitations)
      .set({ revokedAt: nowIso, updatedAt: nowIso })
      .where(eq(teacherInvitations.id, id));
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'teacher-invitation.revoke',
      target: id,
    });
  }
  const updated = (
    await db.select().from(teacherInvitations).where(eq(teacherInvitations.id, id)).limit(1)
  )[0]!;
  const inviterName = await loadInviterName(db, updated.invitedByUserId);
  return success(c, toInvitationSummary(updated, inviterName));
});

r.post('/teacher-invitations/:id/resend', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'id');
  const row = (
    await db.select().from(teacherInvitations).where(eq(teacherInvitations.id, id)).limit(1)
  )[0];
  if (!row) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Invitation not found');
  }
  if (row.acceptedAt) {
    throw new ApiException(409, ERROR_CODES.CONFLICT, 'Invitation already accepted');
  }

  const { plaintext, hash } = await generateInvitationToken();
  const nowIso = new Date().toISOString();
  const expiresAt = expiresAtFromNow();
  const updated = (
    await db
      .update(teacherInvitations)
      .set({
        tokenHash: hash,
        expiresAt,
        revokedAt: null,
        updatedAt: nowIso,
      })
      .where(eq(teacherInvitations.id, id))
      .returning()
  )[0]!;

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'teacher-invitation.resend',
    target: id,
  });

  const inviteUrl = inviteCreateUrl(c, plaintext);
  if (c.env.ENVIRONMENT !== 'production') {
    console.log(`[teacher-invitation] resend ${updated.email} → ${inviteUrl}`);
  }
  const inviterName = await loadInviterName(db, updated.invitedByUserId);
  const summary = toInvitationSummary(updated, inviterName);
  const body: CreatedTeacherInvitation = {
    ...summary,
    token: plaintext,
    inviteUrl,
  };
  return success(c, body);
});

export default r;
