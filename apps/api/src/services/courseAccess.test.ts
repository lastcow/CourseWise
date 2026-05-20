import { describe, expect, it } from 'vitest';
import { canDeleteCourse, type CourseTeacherLookup } from './courseAccess';

const course = '11111111-1111-1111-1111-111111111111';

const adminUser = { id: 'u-admin', role: 'admin' as const };
const teacherUser = { id: 'u-teacher', role: 'teacher' as const };
const studentUser = { id: 'u-student', role: 'student' as const };

function lookup(rows: { teacherId: string; role: 'primary' | 'co_teacher' }[]): CourseTeacherLookup {
  return async (_courseId, teacherId) => rows.find((r) => r.teacherId === teacherId) ?? null;
}

describe('canDeleteCourse', () => {
  it('admin → true regardless of course teachers', async () => {
    expect(await canDeleteCourse(lookup([]), adminUser, course)).toBe(true);
  });
  it('primary teacher of the course → true', async () => {
    expect(
      await canDeleteCourse(lookup([{ teacherId: 'u-teacher', role: 'primary' }]), teacherUser, course),
    ).toBe(true);
  });
  it('co-teacher of the course → false', async () => {
    expect(
      await canDeleteCourse(lookup([{ teacherId: 'u-teacher', role: 'co_teacher' }]), teacherUser, course),
    ).toBe(false);
  });
  it('unrelated teacher → false', async () => {
    expect(await canDeleteCourse(lookup([]), teacherUser, course)).toBe(false);
  });
  it('student → false', async () => {
    expect(await canDeleteCourse(lookup([]), studentUser, course)).toBe(false);
  });
});
