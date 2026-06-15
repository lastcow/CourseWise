import { Hono, type Context } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  DEFAULT_GRADING_POLICY,
  courseDeleteBodySchema,
  createCourseSchema,
  enrollStudentSchema,
  updateCourseSchema,
  type CourseDeletionPreview,
  type CourseDetail,
  type CourseSummary,
  type CreateCourseInput,
  type EnrollStudentInput,
  type GradingPolicy,
  type UpdateCourseInput,
} from '@coursewise/shared';
import {
  courseTeachers,
  courses,
  enrollments,
  fileAssets,
  studentProfiles,
  users,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { requireParam } from '../lib/params';
import { presignR2Url, type R2SignerConfig } from '../lib/r2Sign';
import { requireAuth, requireCourseAccess, requireTokenCourseAccess } from '../middleware/auth';
import { requireScopeGroup } from '../middleware/scope';
import { validateJson } from '../middleware/validate';
import { canDeleteCourse, canWriteCourse } from '../services/courseAccess';
import { courseChildCounts } from '../services/courseDeletion';
import { recordAudit } from '../services/audit';
import { runR2Cleanup } from '../jobs/r2Cleanup';
import type { AppBindings, AppEnv } from '../types';

const r = new Hono<AppEnv>();

const BANNER_URL_TTL_SECONDS = 5 * 60;

function defaultCounts(): CourseSummary['counts'] {
  return { modules: 0, assignments: 0, presentations: 0, students: 0 };
}

function toCourseSummary(
  row: typeof courses.$inferSelect,
  bannerUrl: string | null = null,
  counts: CourseSummary['counts'] = defaultCounts(),
  syllabusFileUrl: string | null = null,
): CourseSummary {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description ?? null,
    termLabel: row.termLabel ?? null,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    disableSubmissionsAfterEnd: row.disableSubmissionsAfterEnd,
    meetingSlots: (row.meetingSlotsJson as CourseSummary['meetingSlots']) ?? null,
    moduleCadence: row.moduleCadence ?? null,
    status: row.status,
    gradingPolicy: (row.gradingPolicyJson as GradingPolicy | null) ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    bannerFileAssetId: row.bannerFileAssetId ?? null,
    bannerUrl,
    syllabusMd: row.syllabusMd ?? null,
    syllabusFileAssetId: row.syllabusFileAssetId ?? null,
    syllabusFileUrl,
    counts,
  };
}

// Optional R2 signer — banner URLs are best-effort. If the Worker is missing
// R2 secrets (e.g. local dev without setup-r2.sh), we silently return a null
// bannerUrl rather than failing the list/detail call.
function tryBannerSignerConfig(env: AppBindings): R2SignerConfig | null {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: env.R2_BUCKET ?? 'coursewise-files',
    endpoint: env.R2_PUBLIC_ENDPOINT || undefined,
  };
}

async function signBannerUrl(
  signer: R2SignerConfig | null,
  bucket: string | null | undefined,
  objectKey: string | null | undefined,
): Promise<string | null> {
  if (!signer || !objectKey) return null;
  // file_assets.bucket may legitimately differ per-asset, but the signer is
  // scoped to one bucket; if they disagree we skip rather than sign against
  // the wrong bucket.
  const targetBucket = bucket ?? signer.bucket;
  if (targetBucket !== signer.bucket) return null;
  const presigned = await presignR2Url(signer, {
    method: 'GET',
    key: objectKey,
    expiresInSeconds: BANNER_URL_TTL_SECONDS,
  });
  return presigned.url;
}

r.use('*', requireAuth);

// List courses scoped by role.
//
// One round-trip: outer scoping by role, banner asset joined in, and four
// COUNT(*) subqueries for modules/assignments/presentations/students.
// Students see only published assignments + presentations in the counts;
// teachers/admins see drafts too. Banner URL is signed per row from the joined
// file_assets columns.
r.get('/courses', requireScopeGroup('coursesRead'), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const env = c.env;

  const scopeSql =
    auth.user.role === 'admin'
      ? sql`true`
      : auth.user.role === 'teacher'
        ? sql`c.id IN (SELECT course_id FROM course_teachers WHERE teacher_id = ${auth.user.id})`
        : sql`c.id IN (SELECT course_id FROM enrollments WHERE student_id = ${auth.user.id} AND status = 'enrolled')`;

  const assignmentFilter = auth.user.role === 'student' ? sql`AND a.status = 'published'` : sql``;
  const presentationFilter = auth.user.role === 'student' ? sql`AND p.status = 'published'` : sql``;
  const moduleFilter = auth.user.role === 'student' ? sql`AND m.status = 'published'` : sql``;

  const result = await db.execute(sql`
    SELECT
      c.id,
      c.code,
      c.title,
      c.description,
      c.term_label AS "termLabel",
      c.start_date AS "startDate",
      c.end_date AS "endDate",
      c.disable_submissions_after_end AS "disableSubmissionsAfterEnd",
      c.meeting_slots_json AS "meetingSlotsJson",
      c.module_cadence AS "moduleCadence",
      c.status,
      c.grading_policy_json AS "gradingPolicyJson",
      c.archived_at AS "archivedAt",
      c.created_at AS "createdAt",
      c.updated_at AS "updatedAt",
      c.banner_file_asset_id AS "bannerFileAssetId",
      c.syllabus_md AS "syllabusMd",
      c.syllabus_file_asset_id AS "syllabusFileAssetId",
      fa.bucket AS "banner_bucket",
      fa.object_key AS "banner_object_key",
      (SELECT count(*)::int FROM modules m WHERE m.course_id = c.id ${moduleFilter}) AS "modules_count",
      (SELECT count(*)::int FROM assignments a WHERE a.course_id = c.id ${assignmentFilter}) AS "assignments_count",
      (SELECT count(*)::int FROM presentations p WHERE p.course_id = c.id ${presentationFilter}) AS "presentations_count",
      (SELECT count(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status = 'enrolled') AS "students_count"
    FROM courses c
    LEFT JOIN file_assets fa ON fa.id = c.banner_file_asset_id
    WHERE ${scopeSql}
    ORDER BY c.created_at ASC
  `);

  const signer = tryBannerSignerConfig(env);
  const summaries: CourseSummary[] = [];
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const bannerUrl = await signBannerUrl(
      signer,
      (row.banner_bucket as string | null) ?? null,
      (row.banner_object_key as string | null) ?? null,
    );
    summaries.push({
      id: row.id as string,
      code: row.code as string,
      title: row.title as string,
      description: (row.description ?? null) as string | null,
      termLabel: (row.termLabel ?? null) as string | null,
      startDate: (row.startDate ?? null) as string | null,
      endDate: (row.endDate ?? null) as string | null,
      disableSubmissionsAfterEnd: Boolean(row.disableSubmissionsAfterEnd),
      meetingSlots: (row.meetingSlotsJson ?? null) as CourseSummary['meetingSlots'],
      moduleCadence: (row.moduleCadence ?? null) as CourseSummary['moduleCadence'],
      status: row.status as CourseSummary['status'],
      gradingPolicy: ((row.gradingPolicyJson as GradingPolicy | null) ??
        null) as CourseSummary['gradingPolicy'],
      archivedAt: (row.archivedAt ?? null) as string | null,
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
      bannerFileAssetId: (row.bannerFileAssetId ?? null) as string | null,
      bannerUrl,
      syllabusMd: (row.syllabusMd ?? null) as string | null,
      syllabusFileAssetId: (row.syllabusFileAssetId ?? null) as string | null,
      syllabusFileUrl: null,
      counts: {
        modules: Number(row.modules_count ?? 0),
        assignments: Number(row.assignments_count ?? 0),
        presentations: Number(row.presentations_count ?? 0),
        students: Number(row.students_count ?? 0),
      },
    });
  }
  return success(c, summaries);
});

// Create a course. Admin or teacher.
r.post(
  '/courses',
  requireScopeGroup('coursesWrite'),
  validateJson(createCourseSchema),
  async (c) => {
    const auth = c.get('auth');
    if (auth.user.role === 'student') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot create courses');
    }
    const input = c.get('validated') as CreateCourseInput;
    const db = c.get('db');

    // Conflict check on code (case-insensitive via citext-like compare; the
    // unique index is on plain code, so we treat case-insensitive via uppercase).
    const existing = await db.select().from(courses).where(eq(courses.code, input.code)).limit(1);
    if (existing.length > 0) {
      throw new ApiException(409, ERROR_CODES.CONFLICT, 'Course code already in use');
    }

    const policy = (input.gradingPolicy ?? DEFAULT_GRADING_POLICY) as GradingPolicy;

    const inserted = await db
      .insert(courses)
      .values({
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        termLabel: input.termLabel ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        disableSubmissionsAfterEnd: input.disableSubmissionsAfterEnd ?? false,
        meetingSlotsJson: input.meetingSlots ?? null,
        moduleCadence: input.moduleCadence ?? null,
        status: input.status ?? 'active',
        gradingPolicyJson: policy,
      })
      .returning();
    const created = inserted[0];
    if (!created)
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create course');

    let teacherId = auth.user.role === 'teacher' ? auth.user.id : null;
    if (auth.user.role === 'admin' && input.teacherId) {
      const teacherRow = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, input.teacherId))
        .limit(1);
      if (teacherRow.length === 0 || teacherRow[0]?.role !== 'teacher') {
        throw new ApiException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'teacherId must be an existing teacher',
        );
      }
      teacherId = input.teacherId;
    }
    if (teacherId) {
      await db.insert(courseTeachers).values({
        courseId: created.id,
        teacherId,
        role: 'primary',
      });
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.create',
      target: created.id,
      metadata: { code: created.code, teacherId },
    });

    return success(c, toCourseSummary(created), 201);
  },
);

// Read a single course (with teachers + enrollment count).
r.get(
  '/courses/:courseId',
  requireScopeGroup('coursesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const env = c.env;
    const courseId = requireParam(c, 'courseId');
    const row = (await db.select().from(courses).where(eq(courses.id, courseId)).limit(1))[0];
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');

    const teacherRows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: courseTeachers.role,
      })
      .from(courseTeachers)
      .innerJoin(users, eq(courseTeachers.teacherId, users.id))
      .where(eq(courseTeachers.courseId, courseId));

    const enrolledRows = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'enrolled')));

    // Counts + banner asset — same shape as the list endpoint so the detail
    // view can hydrate cards without a second fetch.
    const assignmentFilter = auth.user.role === 'student' ? sql`AND a.status = 'published'` : sql``;
    const presentationFilter =
      auth.user.role === 'student' ? sql`AND p.status = 'published'` : sql``;
    const moduleFilter = auth.user.role === 'student' ? sql`AND m.status = 'published'` : sql``;

    const aggResult = await db.execute(sql`
    SELECT
      fa.bucket AS "banner_bucket",
      fa.object_key AS "banner_object_key",
      (SELECT count(*)::int FROM modules m WHERE m.course_id = ${courseId} ${moduleFilter}) AS "modules_count",
      (SELECT count(*)::int FROM assignments a WHERE a.course_id = ${courseId} ${assignmentFilter}) AS "assignments_count",
      (SELECT count(*)::int FROM presentations p WHERE p.course_id = ${courseId} ${presentationFilter}) AS "presentations_count",
      (SELECT count(*)::int FROM enrollments e WHERE e.course_id = ${courseId} AND e.status = 'enrolled') AS "students_count"
    FROM courses c
    LEFT JOIN file_assets fa ON fa.id = c.banner_file_asset_id
    WHERE c.id = ${courseId}
  `);
    const agg = (aggResult.rows[0] ?? {}) as Record<string, unknown>;
    const counts = {
      modules: Number(agg.modules_count ?? 0),
      assignments: Number(agg.assignments_count ?? 0),
      presentations: Number(agg.presentations_count ?? 0),
      students: Number(agg.students_count ?? 0),
    };
    const signer = tryBannerSignerConfig(env);
    const bannerUrl = await signBannerUrl(
      signer,
      (agg.banner_bucket as string | null) ?? null,
      (agg.banner_object_key as string | null) ?? null,
    );

    let syllabusFileUrl: string | null = null;
    if (row.syllabusFileAssetId) {
      const [asset] = await db
        .select({ bucket: fileAssets.bucket, objectKey: fileAssets.objectKey })
        .from(fileAssets)
        .where(eq(fileAssets.id, row.syllabusFileAssetId))
        .limit(1);
      syllabusFileUrl = await signBannerUrl(
        signer,
        asset?.bucket ?? null,
        asset?.objectKey ?? null,
      );
    }

    const detail: CourseDetail = {
      ...toCourseSummary(row, bannerUrl, counts, syllabusFileUrl),
      teachers: teacherRows.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        role: t.role ?? 'primary',
      })),
      enrollmentCount: enrolledRows.length,
    };
    return success(c, detail);
  },
);

// Update a course.
r.patch(
  '/courses/:courseId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(updateCourseSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as UpdateCourseInput;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.code !== undefined) patch.code = input.code;
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.termLabel !== undefined) patch.termLabel = input.termLabel;
    if (input.startDate !== undefined) patch.startDate = input.startDate;
    if (input.endDate !== undefined) patch.endDate = input.endDate;
    if (input.disableSubmissionsAfterEnd !== undefined)
      patch.disableSubmissionsAfterEnd = input.disableSubmissionsAfterEnd;
    if (input.meetingSlots !== undefined) patch.meetingSlotsJson = input.meetingSlots;
    if (input.moduleCadence !== undefined) patch.moduleCadence = input.moduleCadence;
    if (input.status !== undefined) {
      patch.status = input.status;
      patch.archivedAt = input.status === 'archived' ? new Date().toISOString() : null;
    }
    if (input.gradingPolicy !== undefined) patch.gradingPolicyJson = input.gradingPolicy;

    if (input.bannerFileAssetId !== undefined) {
      if (input.bannerFileAssetId === null) {
        patch.bannerFileAssetId = null;
      } else {
        const [asset] = await db
          .select({
            id: fileAssets.id,
            ownerId: fileAssets.ownerId,
            courseId: fileAssets.courseId,
          })
          .from(fileAssets)
          .where(eq(fileAssets.id, input.bannerFileAssetId))
          .limit(1);
        if (
          !asset ||
          asset.courseId !== courseId ||
          (auth.user.role !== 'admin' && asset.ownerId !== auth.user.id)
        ) {
          throw new ApiException(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            'Banner asset must be a course-scoped file you uploaded',
          );
        }
        patch.bannerFileAssetId = input.bannerFileAssetId;
      }
    }

    if (input.syllabusFileAssetId !== undefined) {
      if (input.syllabusFileAssetId === null) {
        patch.syllabusFileAssetId = null;
      } else {
        const [asset] = await db
          .select({
            id: fileAssets.id,
            ownerId: fileAssets.ownerId,
            courseId: fileAssets.courseId,
          })
          .from(fileAssets)
          .where(eq(fileAssets.id, input.syllabusFileAssetId))
          .limit(1);
        if (
          !asset ||
          asset.courseId !== courseId ||
          (auth.user.role !== 'admin' && asset.ownerId !== auth.user.id)
        ) {
          throw new ApiException(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            'Syllabus asset must be a course-scoped file you uploaded',
          );
        }
        patch.syllabusFileAssetId = input.syllabusFileAssetId;
      }
    }

    if (input.syllabusMd !== undefined) {
      patch.syllabusMd = input.syllabusMd;
    }

    if (input.code !== undefined) {
      const existing = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.code, input.code))
        .limit(1);
      if (existing.length > 0 && existing[0]?.id !== courseId) {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'Course code already in use');
      }
    }

    const [updated] = await db
      .update(courses)
      .set(patch)
      .where(eq(courses.id, courseId))
      .returning();
    if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.update',
      target: courseId,
      metadata: { fields: Object.keys(patch) },
    });

    return success(c, toCourseSummary(updated));
  },
);

// Preview the child-row counts that a hard-delete would remove.
r.get(
  '/courses/:courseId/deletion-preview',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canDeleteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No delete access to this course');
    }
    const [course] = await db
      .select({ id: courses.id, code: courses.code, title: courses.title })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    if (!course) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');
    const counts = await courseChildCounts(db, courseId);
    const payload: CourseDeletionPreview = {
      courseId: course.id,
      courseCode: course.code,
      courseTitle: course.title,
      counts,
    };
    return success(c, payload);
  },
);

// Hard delete a course (admin or primary teacher only).
//
// Wipes every cascaded child row in one transaction, queues the R2 prefix
// cleanup for ctx.waitUntil execution, and writes a metadata-only audit row
// to course_deletion_log. The user must type the course code into the request
// body's `confirmCode` field, matching course.code exactly.
r.delete(
  '/courses/:courseId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');

    if (!(await canDeleteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No delete access to this course');
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = courseDeleteBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'confirmCode required');
    }

    const [course] = await db
      .select({ id: courses.id, code: courses.code, title: courses.title })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    if (!course) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');
    if (parsed.data.confirmCode !== course.code) {
      throw new ApiException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Confirmation code does not match course code',
      );
    }

    const counts = await courseChildCounts(db, courseId);
    const jobId = crypto.randomUUID();

    // Single atomic statement: delete the course (FK cascades wipe all 23+ child
    // tables), insert the FERPA audit row and the R2 cleanup job both gated on
    // the delete returning a row. Postgres evaluates all CTE INSERT/DELETE in
    // one snapshot, so the three writes are atomic at the server. Drizzle's
    // db.transaction() is unavailable on the neon-http driver.
    const result = await db.execute(sql`
    WITH deleted AS (
      DELETE FROM courses WHERE id = ${courseId} RETURNING id, code, title
    ),
    log AS (
      INSERT INTO course_deletion_log (course_id, course_code, course_title, deleted_by, child_counts)
      SELECT id, code, title, ${auth.user.id}::uuid, ${JSON.stringify(counts)}::jsonb
      FROM deleted
      RETURNING id
    ),
    job AS (
      INSERT INTO r2_cleanup_jobs (id, course_id, status)
      SELECT ${jobId}::uuid, id, 'pending'
      FROM deleted
      RETURNING id
    )
    SELECT (SELECT id FROM deleted) AS course_id
  `);
    if (!result.rows[0]?.course_id) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.delete',
      target: courseId,
    });

    if (c.env.COURSE_FILES) {
      c.executionCtx.waitUntil(runR2Cleanup(db, c.env.COURSE_FILES, jobId, courseId));
    }

    return success(c, { id: courseId });
  },
);

async function setCourseStatus(c: Context<AppEnv>, status: 'archived' | 'active') {
  const auth = c.get('auth');
  const db = c.get('db');
  const courseId = requireParam(c, 'courseId');
  if (!(await canWriteCourse(db, auth.user, courseId))) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
  }
  const [updated] = await db
    .update(courses)
    .set({
      status,
      archivedAt: status === 'archived' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(courses.id, courseId))
    .returning();
  if (!updated) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Course not found');

  await recordAudit(db, {
    actorType: auth.method === 'jwt' ? 'user' : 'api_token',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: status === 'archived' ? 'course.archive' : 'course.activate',
    target: courseId,
  });
  return success(c, toCourseSummary(updated));
}

r.post(
  '/courses/:courseId/archive',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  (c) => setCourseStatus(c, 'archived'),
);
r.post(
  '/courses/:courseId/activate',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  (c) => setCourseStatus(c, 'active'),
);

// Enrollments
r.get(
  '/courses/:courseId/students',
  requireScopeGroup('coursesRead'),
  requireCourseAccess(),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    if (auth.user.role === 'student') {
      // Students see the full enrolled roster but only the public fields
      // (name + email + status). studentNumber and cross-course enrollment
      // counts stay teacher-only. Peers' names/emails are already exposed
      // through group_memberships → users on the group-set endpoint, so
      // this doesn't broaden the privacy surface.
      const db = c.get('db');
      const courseId = requireParam(c, 'courseId');
      const rows = await db
        .select({
          id: enrollments.id,
          studentId: users.id,
          studentName: users.name,
          studentEmail: users.email,
          enrolledAt: enrollments.enrolledAt,
          status: enrollments.status,
        })
        .from(enrollments)
        .innerJoin(users, eq(enrollments.studentId, users.id))
        .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'enrolled')))
        .orderBy(asc(users.name));
      return success(c, rows);
    }
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const rows = await db
      .select({
        id: enrollments.id,
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        enrolledAt: enrollments.enrolledAt,
        status: enrollments.status,
        studentNumber: studentProfiles.studentNumber,
        // Total active enrollments this student has across the school. Per-
        // row correlated subquery; rosters are small in practice so the
        // extra cost is negligible and we avoid a second round-trip.
        enrolledCourseCount: sql<number>`(
          SELECT count(*)::int FROM enrollments e2
          WHERE e2.student_id = ${users.id} AND e2.status = 'enrolled'
        )`,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(eq(enrollments.courseId, courseId))
      .orderBy(asc(users.name));
    return success(c, rows);
  },
);

r.post(
  '/courses/:courseId/enrollments',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  validateJson(enrollStudentSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const input = c.get('validated') as EnrollStudentInput;
    const student = (
      await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, input.studentId))
        .limit(1)
    )[0];
    if (!student) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Student not found');
    }
    if (student.role !== 'student') {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'User is not a student');
    }
    const existing = await db
      .select({ id: enrollments.id, status: enrollments.status })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, input.studentId)))
      .limit(1);
    if (existing.length > 0) {
      if (existing[0]?.status === 'enrolled') {
        throw new ApiException(409, ERROR_CODES.CONFLICT, 'Student already enrolled');
      }
      await db
        .update(enrollments)
        .set({ status: 'enrolled', updatedAt: new Date().toISOString() })
        .where(eq(enrollments.id, existing[0]!.id));
    } else {
      await db.insert(enrollments).values({
        courseId,
        studentId: input.studentId,
        status: 'enrolled',
      });
    }

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.enroll',
      target: courseId,
      metadata: { studentId: input.studentId },
    });

    return success(c, { ok: true }, 201);
  },
);

r.delete(
  '/courses/:courseId/enrollments/:studentId',
  requireScopeGroup('coursesWrite'),
  requireTokenCourseAccess(),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const courseId = requireParam(c, 'courseId');
    const studentId = requireParam(c, 'studentId');
    if (!(await canWriteCourse(db, auth.user, courseId))) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No write access to this course');
    }
    const result = await db
      .delete(enrollments)
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, studentId)))
      .returning({ id: enrollments.id });
    if (result.length === 0)
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Enrollment not found');

    await recordAudit(db, {
      actorType: auth.method === 'jwt' ? 'user' : 'api_token',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'course.unenroll',
      target: courseId,
      metadata: { studentId },
    });
    return success(c, { ok: true });
  },
);

export default r;
