import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'teacher', 'student']);
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'suspended']);
export const preferredLanguageEnum = pgEnum('preferred_language', ['en', 'zh-CN']);
export const courseStatusEnum = pgEnum('course_status', ['draft', 'active', 'archived']);
export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'enrolled',
  'dropped',
  'completed',
]);
export const invitationStatusEnum = pgEnum('invitation_status', ['active', 'revoked', 'expired']);
export const courseTeacherRoleEnum = pgEnum('course_teacher_role', ['primary', 'co_teacher']);
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'late',
  'excused',
]);
export const quizQuestionTypeEnum = pgEnum('quiz_question_type', [
  'single_choice',
  'multi_choice',
  'short_answer',
]);
export const auditActorTypeEnum = pgEnum('audit_actor_type', ['user', 'api_token', 'system']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: userRoleEnum('role').notNull(),
    status: userStatusEnum('status').notNull().default('active'),
    preferredLanguage: preferredLanguageEnum('preferred_language').notNull().default('en'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'string' }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'string' }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    emailLowerUnique: uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
    roleIdx: index('users_role_idx').on(t.role),
    statusIdx: index('users_status_idx').on(t.status),
  }),
);

export const studentProfiles = pgTable('student_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  studentNumber: text('student_number').unique(),
  enrollmentYear: integer('enrollment_year'),
  ...timestamps,
});

export const teacherProfiles = pgTable('teacher_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  employeeNumber: text('employee_number').unique(),
  department: text('department'),
  title: text('title'),
  ...timestamps,
});

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'string' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('api_tokens_token_hash_idx').on(t.tokenHash),
    userIdIdx: index('api_tokens_user_id_idx').on(t.userId),
  }),
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    familyId: uuid('family_id').notNull(),
    replacedById: uuid('replaced_by_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('refresh_tokens_token_hash_idx').on(t.tokenHash),
    familyIdx: index('refresh_tokens_family_idx').on(t.userId, t.familyId),
  }),
);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    termLabel: text('term_label'),
    status: courseStatusEnum('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    statusIdx: index('courses_status_idx').on(t.status),
  }),
);

export const courseTeachers = pgTable(
  'course_teachers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: courseTeacherRoleEnum('role').notNull().default('primary'),
    ...timestamps,
  },
  (t) => ({
    courseTeacherUnique: uniqueIndex('course_teachers_course_teacher_idx').on(
      t.courseId,
      t.teacherId,
    ),
  }),
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: enrollmentStatusEnum('status').notNull().default('enrolled'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => ({
    courseStudentUnique: uniqueIndex('enrollments_course_student_idx').on(t.courseId, t.studentId),
  }),
);

export const invitationCodes = pgTable(
  'invitation_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    status: invitationStatusEnum('status').notNull().default('active'),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => ({
    codeLowerUnique: uniqueIndex('invitation_codes_code_lower_idx').on(sql`lower(${t.code})`),
    courseIdx: index('invitation_codes_course_idx').on(t.courseId),
  }),
);

export const modules = pgTable(
  'modules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('modules_course_idx').on(t.courseId),
  }),
);

export const fileAssets = pgTable('file_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  bucket: text('bucket').notNull().default('coursewise-files'),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type'),
  sizeBytes: integer('size_bytes'),
  originalFilename: text('original_filename'),
  ...timestamps,
});

export const presentations = pgTable(
  'presentations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    moduleIdx: index('presentations_module_idx').on(t.moduleId),
  }),
);

export const slides = pgTable(
  'slides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    title: text('title'),
    content: jsonb('content'),
    imageAssetId: uuid('image_asset_id').references(() => fileAssets.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => ({
    presentationIdx: index('slides_presentation_idx').on(t.presentationId),
  }),
);

export const readingMaterials = pgTable(
  'reading_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content'),
    fileAssetId: uuid('file_asset_id').references(() => fileAssets.id, {
      onDelete: 'set null',
    }),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    moduleIdx: index('reading_materials_module_idx').on(t.moduleId),
  }),
);

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: timestamp('due_date', { withTimezone: true, mode: 'string' }),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    moduleIdx: index('assignments_module_idx').on(t.moduleId),
  }),
);

export const assignmentSubmissions = pgTable(
  'assignment_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }),
    content: text('content'),
    fileAssetId: uuid('file_asset_id').references(() => fileAssets.id, {
      onDelete: 'set null',
    }),
    score: numeric('score', { precision: 6, scale: 2 }),
    feedback: text('feedback'),
    gradedAt: timestamp('graded_at', { withTimezone: true, mode: 'string' }),
    gradedById: uuid('graded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => ({
    assignmentStudentIdx: index('assignment_submissions_assignment_student_idx').on(
      t.assignmentId,
      t.studentId,
    ),
  }),
);

export const discussionTopics = pgTable(
  'discussion_topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    prompt: text('prompt'),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }),
    ...timestamps,
  },
  (t) => ({
    moduleIdx: index('discussion_topics_module_idx').on(t.moduleId),
  }),
);

export const discussionPosts = pgTable(
  'discussion_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => discussionTopics.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    content: text('content').notNull(),
    ...timestamps,
  },
  (t) => ({
    topicIdx: index('discussion_posts_topic_idx').on(t.topicId),
  }),
);

export const discussionGrades = pgTable(
  'discussion_grades',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => discussionTopics.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: numeric('score', { precision: 6, scale: 2 }),
    feedback: text('feedback'),
    gradedById: uuid('graded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    gradedAt: timestamp('graded_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    topicStudentUnique: uniqueIndex('discussion_grades_topic_student_idx').on(
      t.topicId,
      t.studentId,
    ),
  }),
);

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    timeLimitSeconds: integer('time_limit_seconds'),
    maxAttempts: integer('max_attempts').notNull().default(1),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }),
    ...timestamps,
  },
  (t) => ({
    moduleIdx: index('quizzes_module_idx').on(t.moduleId),
  }),
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    prompt: text('prompt').notNull(),
    type: quizQuestionTypeEnum('type').notNull(),
    options: jsonb('options'),
    correctAnswers: jsonb('correct_answers'),
    points: numeric('points', { precision: 6, scale: 2 }).notNull().default('1.00'),
    ...timestamps,
  },
  (t) => ({
    quizIdx: index('quiz_questions_quiz_idx').on(t.quizId),
  }),
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }),
    score: numeric('score', { precision: 6, scale: 2 }),
    ...timestamps,
  },
  (t) => ({
    quizStudentIdx: index('quiz_attempts_quiz_student_idx').on(t.quizId, t.studentId),
  }),
);

export const quizAnswers = pgTable(
  'quiz_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => quizAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    answer: jsonb('answer'),
    isCorrect: boolean('is_correct'),
    pointsAwarded: numeric('points_awarded', { precision: 6, scale: 2 }),
    ...timestamps,
  },
  (t) => ({
    attemptIdx: index('quiz_answers_attempt_idx').on(t.attemptId),
  }),
);

export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sessionDate: timestamp('session_date', { withTimezone: true, mode: 'string' }).notNull(),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('attendance_sessions_course_idx').on(t.courseId),
  }),
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: attendanceStatusEnum('status').notNull(),
    recordedById: uuid('recorded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => ({
    sessionStudentUnique: uniqueIndex('attendance_records_session_student_idx').on(
      t.sessionId,
      t.studentId,
    ),
  }),
);

export const finalGrades = pgTable(
  'final_grades',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    letterGrade: text('letter_grade'),
    score: numeric('score', { precision: 6, scale: 2 }),
    gradingPolicySnapshot: jsonb('grading_policy_snapshot'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'string' }),
    finalizedById: uuid('finalized_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => ({
    courseStudentUnique: uniqueIndex('final_grades_course_student_idx').on(t.courseId, t.studentId),
  }),
);

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    linkUrl: text('link_url'),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    userIdx: index('alerts_user_idx').on(t.userId),
  }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorType: auditActorTypeEnum('actor_type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorTokenId: uuid('actor_token_id').references(() => apiTokens.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    target: text('target'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    metadataJson: jsonb('metadata_json'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    actorUserIdx: index('audit_logs_actor_user_idx').on(t.actorUserId),
    actionIdx: index('audit_logs_action_idx').on(t.action),
    createdIdx: index('audit_logs_created_idx').on(t.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type Course = typeof courses.$inferSelect;
