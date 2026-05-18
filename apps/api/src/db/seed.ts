import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { createDb } from './client';
import {
  courseTeachers,
  courses,
  enrollments,
  invitationCodes,
  studentProfiles,
  teacherProfiles,
  users,
} from './schema';

async function findUserByEmail(db: ReturnType<typeof createDb>, email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return rows[0];
}

async function upsertUser(
  db: ReturnType<typeof createDb>,
  data: {
    email: string;
    name: string;
    role: 'admin' | 'teacher' | 'student';
    password: string;
  },
) {
  const existing = await findUserByEmail(db, data.email);
  const hash = await bcrypt.hash(data.password, 10);
  if (existing) {
    await db
      .update(users)
      .set({
        name: data.name,
        passwordHash: hash,
        role: data.role,
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, existing.id));
    return { ...existing, role: data.role, name: data.name };
  }
  const inserted = await db
    .insert(users)
    .values({
      email: data.email,
      passwordHash: hash,
      name: data.name,
      role: data.role,
      status: 'active',
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error(`Failed to insert user ${data.email}`);
  return row;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const db = createDb(url);

  console.log('Seeding users…');
  const admin = await upsertUser(db, {
    email: 'ebiz@chen.me',
    name: 'Admin',
    role: 'admin',
    password: 'Paradise@0',
  });

  const teacher = await upsertUser(db, {
    email: 'teacher@example.com',
    name: 'Teacher Tan',
    role: 'teacher',
    password: 'Teacher123!',
  });

  const teacherProfileExisting = await db
    .select()
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, teacher.id))
    .limit(1);
  if (teacherProfileExisting.length === 0) {
    await db.insert(teacherProfiles).values({
      userId: teacher.id,
      department: 'Management',
      title: 'Lecturer',
    });
  }

  const studentEmails = [
    { email: 'student1@example.com', name: 'Student One' },
    { email: 'student2@example.com', name: 'Student Two' },
    { email: 'student3@example.com', name: 'Student Three' },
  ];

  const students = [] as Awaited<ReturnType<typeof upsertUser>>[];
  for (const s of studentEmails) {
    const u = await upsertUser(db, {
      email: s.email,
      name: s.name,
      role: 'student',
      password: 'Student123!',
    });
    const exists = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, u.id))
      .limit(1);
    if (exists.length === 0) {
      await db.insert(studentProfiles).values({ userId: u.id, enrollmentYear: 2026 });
    }
    students.push(u);
  }

  console.log('Seeding course MGMT101…');
  const courseRows = await db.select().from(courses).where(eq(courses.code, 'MGMT101')).limit(1);
  let course = courseRows[0];
  if (!course) {
    const inserted = await db
      .insert(courses)
      .values({
        code: 'MGMT101',
        title: 'Introduction to Management',
        description: 'A first course in management theory and practice.',
        termLabel: '2026-Spring',
        status: 'active',
      })
      .returning();
    course = inserted[0];
  }
  if (!course) throw new Error('Failed to create course MGMT101');

  const ctExisting = await db
    .select()
    .from(courseTeachers)
    .where(
      sql`${courseTeachers.courseId} = ${course.id} and ${courseTeachers.teacherId} = ${teacher.id}`,
    )
    .limit(1);
  if (ctExisting.length === 0) {
    await db.insert(courseTeachers).values({
      courseId: course.id,
      teacherId: teacher.id,
      role: 'primary',
    });
  }

  for (const s of students) {
    const enr = await db
      .select()
      .from(enrollments)
      .where(sql`${enrollments.courseId} = ${course.id} and ${enrollments.studentId} = ${s.id}`)
      .limit(1);
    if (enr.length === 0) {
      await db.insert(enrollments).values({
        courseId: course.id,
        studentId: s.id,
        status: 'enrolled',
      });
    }
  }

  console.log('Seeding invitation code MGMT101-2026…');
  const code = 'MGMT101-2026';
  const existingCode = await db
    .select()
    .from(invitationCodes)
    .where(sql`lower(${invitationCodes.code}) = lower(${code})`)
    .limit(1);
  if (existingCode.length === 0) {
    await db.insert(invitationCodes).values({
      code,
      courseId: course.id,
      maxUses: null,
      status: 'active',
      createdById: admin.id,
    });
  }

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
