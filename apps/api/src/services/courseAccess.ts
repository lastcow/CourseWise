import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { courseTeachers, enrollments } from '../db/schema';
import type { AuthenticatedUser } from '../middleware/types';

export async function isCourseTeacher(
  db: Db,
  courseId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: courseTeachers.id })
    .from(courseTeachers)
    .where(and(eq(courseTeachers.courseId, courseId), eq(courseTeachers.teacherId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function isCourseEnrolled(
  db: Db,
  courseId: string,
  studentId: string,
): Promise<boolean> {
  const rows = await db
    .select({ status: enrollments.status })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, studentId)))
    .limit(1);
  return rows.length > 0 && rows[0]?.status === 'enrolled';
}

export async function canAccessCourse(
  db: Db,
  user: AuthenticatedUser,
  courseId: string,
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return isCourseTeacher(db, courseId, user.id);
  if (user.role === 'student') return isCourseEnrolled(db, courseId, user.id);
  return false;
}

export async function canWriteCourse(
  db: Db,
  user: AuthenticatedUser,
  courseId: string,
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return isCourseTeacher(db, courseId, user.id);
  return false;
}

export type CourseTeacherRoleRow = { teacherId: string; role: 'primary' | 'co_teacher' };
export type CourseTeacherLookup = (
  courseId: string,
  teacherId: string,
) => Promise<CourseTeacherRoleRow | null>;

function lookupFromDb(db: Db): CourseTeacherLookup {
  return async (courseId, teacherId) => {
    const rows = await db
      .select({ teacherId: courseTeachers.teacherId, role: courseTeachers.role })
      .from(courseTeachers)
      .where(and(eq(courseTeachers.courseId, courseId), eq(courseTeachers.teacherId, teacherId)))
      .limit(1);
    return rows[0] ?? null;
  };
}

export async function canDeleteCourse(
  lookupOrDb: CourseTeacherLookup | Db,
  user: Pick<AuthenticatedUser, 'id' | 'role'>,
  courseId: string,
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  const lookup = typeof lookupOrDb === 'function' ? lookupOrDb : lookupFromDb(lookupOrDb);
  const row = await lookup(courseId, user.id);
  return row?.role === 'primary';
}
