import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  type StudentProfileDetail,
  type StudentProfileEnrollmentRow,
  type UpdateStudentProfileInput,
} from '@coursewise/shared';
import {
  courseTeachers,
  courses,
  enrollments,
  studentProfiles,
  users,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth } from '../middleware/auth';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import type { AppEnv } from '../types';
import type { Db } from '../db/client';
import type { AuthenticatedUser } from '../middleware/types';

const r = new Hono<AppEnv>();
r.use('*', requireAuth);

// Update schema. `studentNumber` is nullable so callers can clear the value;
// undefined means "leave it alone". Empty string is normalized to null.
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  studentNumber: z
    .union([z.string().trim().max(60), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      return v.length === 0 ? null : v;
    }),
});

/**
 * Permission predicate shared by both endpoints:
 *   admin   → always allowed
 *   self    → always allowed (any role acting on its own row)
 *   teacher → allowed iff there's a course they teach AND the target is
 *             enrolled in that course.
 *   else    → 403
 */
async function canAccessStudentProfile(
  db: Db,
  caller: AuthenticatedUser,
  targetUserId: string,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.id === targetUserId) return true;
  if (caller.role !== 'teacher') return false;
  const [row] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(courseTeachers, eq(courseTeachers.courseId, enrollments.courseId))
    .where(
      and(
        eq(enrollments.studentId, targetUserId),
        eq(courseTeachers.teacherId, caller.id),
      ),
    )
    .limit(1);
  return !!row;
}

async function fetchProfile(db: Db, userId: string): Promise<StudentProfileDetail | null> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      preferredLanguage: users.preferredLanguage,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const [profile] = await db
    .select({
      studentNumber: studentProfiles.studentNumber,
      enrollmentYear: studentProfiles.enrollmentYear,
    })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);

  const enrollmentRows = await db
    .select({
      courseId: courses.id,
      courseCode: courses.code,
      courseTitle: courses.title,
      status: enrollments.status,
      enrolledAt: enrollments.enrolledAt,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(eq(enrollments.studentId, userId))
    .orderBy(asc(courses.code));

  const detail: StudentProfileDetail = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role as StudentProfileDetail['role'],
    studentNumber: profile?.studentNumber ?? null,
    enrollmentYear: profile?.enrollmentYear ?? null,
    preferredLanguage: user.preferredLanguage,
    enrollments: enrollmentRows.map(
      (e): StudentProfileEnrollmentRow => ({
        courseId: e.courseId,
        courseCode: e.courseCode,
        courseTitle: e.courseTitle,
        status: e.status,
        enrolledAt: e.enrolledAt,
      }),
    ),
  };
  return detail;
}

// GET /api/students/:userId/profile
r.get('/students/:userId/profile', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const userId = requireParam(c, 'userId');
  if (!(await canAccessStudentProfile(db, auth.user, userId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this profile');
  }
  const profile = await fetchProfile(db, userId);
  if (!profile) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'User not found');
  // Only students have a meaningful "student profile" view; surface the
  // shape regardless so the dialog still works on rare staff rows, but
  // callers should be aware.
  return success(c, profile);
});

// PATCH /api/students/:userId/profile — update name and/or studentNumber.
r.patch('/students/:userId/profile', validateJson(updateSchema), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const userId = requireParam(c, 'userId');
  const input = c.get('validated') as UpdateStudentProfileInput;
  if (!(await canAccessStudentProfile(db, auth.user, userId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this profile');
  }

  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'User not found');

  // Limit edits to student rows. Staff edits to their own name/number go
  // through the Settings page, not this dialog, so reject here to avoid
  // surprising the caller.
  if (target.role !== 'student') {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Target is not a student');
  }

  const wantsName = typeof input.name === 'string';
  const wantsNumber = Object.prototype.hasOwnProperty.call(input, 'studentNumber');
  if (!wantsName && !wantsNumber) {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'No fields to update');
  }

  if (wantsName) {
    await db.update(users).set({ name: input.name }).where(eq(users.id, userId));
  }

  if (wantsNumber) {
    // Uniqueness on studentNumber is enforced by the DB index; check ahead
    // of time so we can return a clean i18n key instead of leaking the
    // Postgres error.
    const next = input.studentNumber ?? null;
    if (next !== null) {
      const [conflict] = await db
        .select({ userId: studentProfiles.userId })
        .from(studentProfiles)
        .where(
          and(eq(studentProfiles.studentNumber, next), sql`${studentProfiles.userId} <> ${userId}`),
        )
        .limit(1);
      if (conflict) {
        throw new ApiException(
          409,
          ERROR_CODES.CONFLICT,
          'Another student already has this student number',
        );
      }
    }
    // Upsert: a student created via accept-invite gets a row in auth.ts;
    // gracefully handle the (older) cases where they don't.
    await db
      .insert(studentProfiles)
      .values({ userId, studentNumber: next })
      .onConflictDoUpdate({
        target: studentProfiles.userId,
        set: { studentNumber: next, updatedAt: new Date().toISOString() },
      });
  }

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'student.profile.update',
    target: userId,
    metadata: {
      changed: {
        name: wantsName,
        studentNumber: wantsNumber,
      },
    },
  });

  const updated = await fetchProfile(db, userId);
  if (!updated) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to reload profile');
  return success(c, updated);
});

export default r;
