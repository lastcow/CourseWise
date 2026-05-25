import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  type DeleteEmailStatus,
  type DeleteStudentAccountInput,
  type DeleteStudentAccountResponse,
  type StudentProfileDetail,
  type StudentProfileEnrollmentRow,
  type UpdateStudentProfileInput,
} from '@coursewise/shared';
import {
  courseTeachers,
  courses,
  enrollments,
  fileAssets,
  studentProfiles,
  userDeletionLog,
  users,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { requireAuth } from '../middleware/auth';
import { validateJson } from '../middleware/validate';
import { recordAudit } from '../services/audit';
import { renderStudentDropEmail } from '../services/userDropEmail';
import { sendEmailViaCloudflare } from '../services/email';
import type { AppBindings, AppEnv } from '../types';
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

// ---------- Hard delete ----------

const deleteSchema = z.object({
  reason: z
    .union([z.string().trim().max(500), z.null()])
    .optional()
    .transform((v) => (v == null || v === '' ? null : v)),
});

/**
 * Stricter cousin of canAccessStudentProfile: deletion is admin (any) or
 * teacher (with course overlap). Self-delete is NOT allowed through this
 * endpoint — staff lifecycle lives elsewhere and a typo-fix workflow
 * shouldn't double as an account-closure flow.
 */
async function canDeleteStudent(
  db: Db,
  caller: AuthenticatedUser,
  targetUserId: string,
): Promise<boolean> {
  if (caller.id === targetUserId) return false;
  if (caller.role === 'admin') return true;
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

async function snapshotChildCounts(
  db: Db,
  userId: string,
): Promise<Record<string, number>> {
  const [counts] = await db
    .select({
      enrollments: sql<number>`(select count(*)::int from enrollments where student_id = ${userId})`,
      submissions: sql<number>`(select count(*)::int from assignment_submissions where student_id = ${userId})`,
      quizAttempts: sql<number>`(select count(*)::int from quiz_attempts where student_id = ${userId})`,
      attendanceRecords: sql<number>`(select count(*)::int from attendance_records where student_id = ${userId})`,
      groupMemberships: sql<number>`(select count(*)::int from group_memberships where student_id = ${userId})`,
      messageThreads: sql<number>`(select count(*)::int from message_threads where participant_a_id = ${userId} or participant_b_id = ${userId})`,
      fileAssets: sql<number>`(select count(*)::int from file_assets where owner_id = ${userId})`,
    })
    .from(sql`(select 1) as _`);
  return {
    enrollments: counts?.enrollments ?? 0,
    submissions: counts?.submissions ?? 0,
    quizAttempts: counts?.quizAttempts ?? 0,
    attendanceRecords: counts?.attendanceRecords ?? 0,
    groupMemberships: counts?.groupMemberships ?? 0,
    messageThreads: counts?.messageThreads ?? 0,
    fileAssets: counts?.fileAssets ?? 0,
  };
}

// DELETE /api/students/:userId — hard delete a student account.
r.delete('/students/:userId', validateJson(deleteSchema), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const userId = requireParam(c, 'userId');
  const input = c.get('validated') as DeleteStudentAccountInput;

  if (!(await canDeleteStudent(db, auth.user, userId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No delete access to this student');
  }

  const [target] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'User not found');
  if (target.role !== 'student') {
    throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Target is not a student');
  }

  // Snapshot the courses they were enrolled in so the notification email
  // can list them, and capture object_keys of owner-private R2 files so
  // the post-delete cleanup can purge them.
  const enrolledCourses = await db
    .select({ code: courses.code, title: courses.title })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(eq(enrollments.studentId, userId));
  const ownedFiles = await db
    .select({ id: fileAssets.id, objectKey: fileAssets.objectKey })
    .from(fileAssets)
    .where(eq(fileAssets.ownerId, userId));
  const childCounts = await snapshotChildCounts(db, userId);

  // Best-effort: render and send the notification email before the
  // destructive DELETE. A send failure does not block the delete; the
  // status is recorded on the audit row.
  const rendered = renderStudentDropEmail({
    name: target.name,
    courses: enrolledCourses.map((cc) => ({ code: cc.code, title: cc.title })),
    reason: input.reason ?? null,
  });

  let emailStatus: DeleteEmailStatus = 'skipped';
  let emailProviderId: string | null = null;
  if (c.env.SEND_EMAIL) {
    try {
      const fromAddress = c.env.EMAIL_FROM ?? 'CourseWise <noreply@fsuac.com>';
      const res = await sendEmailViaCloudflare(c.env.SEND_EMAIL, {
        to: target.email,
        from: fromAddress,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      emailStatus = 'sent';
      emailProviderId =
        (res as unknown as { messageId?: string })?.messageId ?? null;
    } catch (err) {
      console.error('user-drop email failed', { userId, err });
      emailStatus = 'failed';
    }
  }

  // Insert the audit row BEFORE the destructive DELETE so the log
  // survives even if the cascade trips a constraint. Then run the delete
  // in a single statement — FKs cascade through enrollments, submissions,
  // quiz_attempts, attendance_records, group_memberships, messages,
  // message_threads, etc. fileAssets.owner_id is ON DELETE SET NULL so
  // those rows survive (orphan), and the file objects are purged below
  // via the R2 binding.
  await db.insert(userDeletionLog).values({
    userId,
    userEmail: target.email,
    userName: target.name,
    userRole: target.role,
    deletedBy: auth.user.id,
    reason: input.reason ?? null,
    enrollmentCount: enrolledCourses.length,
    emailStatus,
    emailProviderId,
    childCounts,
  });

  const deleted = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (deleted.length === 0) {
    throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Delete returned no rows');
  }

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'user.delete',
    target: userId,
    metadata: {
      role: target.role,
      enrollmentCount: enrolledCourses.length,
      emailStatus,
    },
  });

  // Best-effort R2 object cleanup. The Worker's COURSE_FILES binding may
  // not be present in tests — guard accordingly. Owner-private R2 keys
  // are deleted; rows are already orphaned (ownerId NULL) by the cascade
  // so a later sweep can reclaim metadata if desired.
  if (c.env.COURSE_FILES && ownedFiles.length > 0) {
    c.executionCtx.waitUntil(
      runOwnerR2Cleanup(c.env.COURSE_FILES, ownedFiles.map((f) => f.objectKey)),
    );
  }

  const body: DeleteStudentAccountResponse = { id: userId, emailStatus };
  return success(c, body);
});

async function runOwnerR2Cleanup(
  bucket: NonNullable<AppBindings['COURSE_FILES']>,
  keys: string[],
): Promise<void> {
  // Tolerate per-object failures; this runs out-of-band via waitUntil so
  // a transient R2 error shouldn't surface to the client. Keys are
  // typically <5 per deleted student account, so a serial loop is fine.
  for (const key of keys) {
    try {
      await bucket.delete(key);
    } catch (err) {
      console.error('owner R2 cleanup failed', { key, err });
    }
  }
}

export default r;
