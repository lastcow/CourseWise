import { Hono } from 'hono';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  createManualAlertSchema,
  resolveAlertSchema,
  type AlertStatus,
  type AlertSummary,
  type AlertWithStudent,
  type CreateManualAlertInput,
  type GenerateAlertsResult,
  type ResolveAlertInput,
} from '@coursewise/shared';
import { alerts, enrollments, users } from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import {
  requireAuth,
  requireCourseAccess,
  requireTokenCourseAccess,
} from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { canWriteCourse, isCourseTeacher } from '../services/courseAccess';
import { evaluateCourseAlerts, toAlertSummary } from '../services/alertRules';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

// =================== List & filter ===================

r.get(
  '/courses/:courseId/alerts',
  requireScopeGroup('alertsRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot list course alerts');
    }
    const statusFilter = c.req.query('status') as AlertStatus | undefined;
    const where = [eq(alerts.courseId, courseId)];
    if (statusFilter) where.push(eq(alerts.status, statusFilter));
    const rows = await db
      .select({ a: alerts, name: users.name, email: users.email })
      .from(alerts)
      .innerJoin(users, eq(alerts.userId, users.id))
      .where(and(...where))
      .orderBy(desc(alerts.createdAt));
    const out: AlertWithStudent[] = rows.map(({ a, name, email }) => ({
      ...toAlertSummary(a),
      student: { id: a.userId, name, email },
    }));
    return success(c, out);
  },
);

r.post(
  '/courses/:courseId/alerts',
  requireScopeGroup('alertsWrite'),
  requireTokenCourseAccess(),
  validateJson(createManualAlertSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as CreateManualAlertInput;
    // Enforce that target user is enrolled in the course.
    const [enrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, input.userId)),
      )
      .limit(1);
    if (!enrollment) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Target user is not enrolled in this course',
      );
    }
    const [created] = await db
      .insert(alerts)
      .values({
        userId: input.userId,
        courseId,
        type: input.type,
        severity: input.severity ?? 'warning',
        status: 'open',
        title: input.title,
        body: input.body ?? null,
        linkUrl: input.linkUrl ?? null,
      })
      .returning();
    if (!created) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create alert');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'alert.create',
      target: created.id,
      metadata: { courseId, type: input.type, severity: input.severity ?? 'warning' },
    });
    return success(c, toAlertSummary(created), 201);
  },
);

r.post(
  '/courses/:courseId/alerts/generate',
  requireScopeGroup('alertsWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const result: GenerateAlertsResult = await evaluateCourseAlerts(db, courseId);
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'alerts.generate',
      target: courseId,
      metadata: { generated: result.generated, byType: result.byType },
    });
    return success(c, result);
  },
);

r.post(
  '/alerts/:alertId/resolve',
  requireScopeGroup('alertsWrite'),
  validateJson(resolveAlertSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const id = requireParam(c, 'alertId');
    const [existing] = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    if (!existing) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Alert not found');
    if (existing.courseId && !(await canWriteCourse(db, auth.user, existing.courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    if (!existing.courseId && auth.user.role !== 'admin') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Only admins can resolve system alerts');
    }
    const input = c.get('validated') as ResolveAlertInput;
    const now = new Date().toISOString();
    const [updated] = await db
      .update(alerts)
      .set({
        status: input.status ?? 'resolved',
        resolvedAt: now,
        resolvedById: auth.user.id,
        resolutionNote: input.resolutionNote ?? null,
        updatedAt: now,
      })
      .where(eq(alerts.id, id))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Alert not found');
    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'alert.resolve',
      target: id,
      metadata: { status: updated.status },
    });
    return success(c, toAlertSummary(updated));
  },
);

r.get('/me/alerts', requireScopeGroup('alertsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const statusFilter = c.req.query('status') as AlertStatus | undefined;
  const where = [eq(alerts.userId, auth.user.id)];
  if (statusFilter) where.push(eq(alerts.status, statusFilter));
  const rows = await db
    .select()
    .from(alerts)
    .where(and(...where))
    .orderBy(desc(alerts.createdAt));
  const out: AlertSummary[] = rows.map(toAlertSummary);
  return success(c, out);
});

r.post('/me/alerts/:alertId/read', requireScopeGroup('alertsRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const id = requireParam(c, 'alertId');
  const [row] = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Alert not found');
  if (row.userId !== auth.user.id) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Cannot mark another user\'s alert');
  }
  const now = new Date().toISOString();
  const [updated] = await db
    .update(alerts)
    .set({ readAt: now, updatedAt: now })
    .where(eq(alerts.id, id))
    .returning();
  return success(c, toAlertSummary(updated!));
});

// Suppress unused vars.
void sql;
void inArray;
void isCourseTeacher;

export default r;
