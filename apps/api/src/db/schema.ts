import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
import type { AiPromptDepthConfig } from '@coursewise/shared';

export const userRoleEnum = pgEnum('user_role', ['admin', 'teacher', 'student']);
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'suspended']);
export const preferredLanguageEnum = pgEnum('preferred_language', ['en', 'zh-CN', 'fr']);
export const courseStatusEnum = pgEnum('course_status', ['draft', 'active', 'archived']);
// How modules chunk against the course schedule: one module per class session
// (driven by meeting_slots_json) or per fixed period.
export const moduleCadenceEnum = pgEnum('module_cadence', [
  'session',
  'daily',
  'weekly',
  'biweekly',
  'monthly',
]);
export const moduleStatusEnum = pgEnum('module_status', ['draft', 'published']);
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
  'multiple_choice',
  'true_false',
  'short_answer',
  'case_analysis',
]);
export const quizStatusEnum = pgEnum('quiz_status', ['draft', 'published', 'closed', 'archived']);
export const quizAttemptStatusEnum = pgEnum('quiz_attempt_status', [
  'in_progress',
  'submitted',
  'expired',
]);
export const attendanceSessionStatusEnum = pgEnum('attendance_session_status', ['open', 'closed']);
export const auditActorTypeEnum = pgEnum('audit_actor_type', ['user', 'api_token', 'system']);
export const materialStatusEnum = pgEnum('material_status', ['draft', 'published', 'archived']);
export const materialSourceTypeEnum = pgEnum('material_source_type', [
  'upload',
  'external_link',
  'manual_text',
]);
export const fileAssetStatusEnum = pgEnum('file_asset_status', ['pending', 'ready', 'deleted']);
export const presentationStatusEnum = pgEnum('presentation_status', [
  'draft',
  'published',
  'archived',
]);
export const assignmentStatusEnum = pgEnum('assignment_status', [
  'draft',
  'published',
  'closed',
  'archived',
]);
export const submissionStatusEnum = pgEnum('submission_status', [
  'draft',
  'submitted',
  'late',
  'graded',
  'returned',
]);
export const discussionTopicStatusEnum = pgEnum('discussion_topic_status', [
  'draft',
  'published',
  'archived',
]);
export const groupSetSignupModeEnum = pgEnum('group_set_signup_mode', [
  'self_signup',
  'teacher_assigned',
  'mixed',
]);
export const groupSetSignupStatusEnum = pgEnum('group_set_signup_status', [
  'open',
  'locked',
]);
export const submissionModeEnum = pgEnum('submission_mode', ['individual', 'group']);
export const alertTypeEnum = pgEnum('alert_type', [
  'attendance_low',
  'consecutive_absences',
  'late_submissions',
  'quiz_average_low',
  'inactivity',
  'manual',
  'quiz_schedule_open',
]);
export const alertSeverityEnum = pgEnum('alert_severity', ['info', 'warning', 'critical']);
export const alertStatusEnum = pgEnum('alert_status', ['open', 'resolved', 'dismissed']);
export const aiProviderKindEnum = pgEnum('ai_provider_kind', ['anthropic', 'openai']);
export const aiJobStatusEnum = pgEnum('ai_job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'partial',
  'canceled',
]);
export const r2CleanupJobStatusEnum = pgEnum('r2_cleanup_job_status', [
  'pending',
  'running',
  'done',
  'failed',
]);
export const courseExportStatusEnum = pgEnum('course_export_status', [
  'pending',
  'running',
  'done',
  'failed',
]);
export const aiArtifactKindEnum = pgEnum('ai_artifact_kind', [
  'material',
  'presentation',
  'assignment',
  'project',
  'quiz',
]);
export const aiArtifactStatusEnum = pgEnum('ai_artifact_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
]);
export const aiEventLevelEnum = pgEnum('ai_event_level', ['info', 'warn', 'error']);

// FERPA §99.20 — record-correction requests.
export const recordCorrectionTargetEnum = pgEnum('record_correction_target', [
  'final_grade',
  'attendance',
  'submission',
  'discussion',
  'profile',
  'other',
]);
export const recordCorrectionStatusEnum = pgEnum('record_correction_status', [
  'open',
  'accepted',
  'declined',
  'withdrawn',
]);

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

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('password_reset_tokens_token_hash_idx').on(t.tokenHash),
    userIdx: index('password_reset_tokens_user_idx').on(t.userId),
  }),
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    termLabel: text('term_label'),
    // Course schedule window. Drives the time-based progress bar on the course
    // home page (elapsed = now between start and end). Both nullable: a course
    // with no dates simply shows no progress bar.
    startDate: timestamp('start_date', { withTimezone: true, mode: 'string' }),
    endDate: timestamp('end_date', { withTimezone: true, mode: 'string' }),
    // Weekly meeting slots ("every Mon 1-2PM"): array of
    // { day: 0-6 (Sun-Sat), start: 'HH:MM', end: 'HH:MM' }.
    meetingSlotsJson: jsonb('meeting_slots_json'),
    // Teacher-chosen module chunking; null = modules are not schedule-driven.
    moduleCadence: moduleCadenceEnum('module_cadence'),
    status: courseStatusEnum('status').notNull().default('active'),
    gradingPolicyJson: jsonb('grading_policy_json'),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    bannerFileAssetId: uuid('banner_file_asset_id').references((): AnyPgColumn => fileAssets.id, {
      onDelete: 'set null',
    }),
    syllabusMd: text('syllabus_md'),
    syllabusFileAssetId: uuid('syllabus_file_asset_id').references((): AnyPgColumn => fileAssets.id, {
      onDelete: 'set null',
    }),
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
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
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
    // Visibility follows the same draft/published lifecycle as course items:
    // students only see published modules.
    status: moduleStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    // Schedule window (auto-aligned from the course cadence, individually
    // adjustable). A module past endAt — or manually closed via closedAt —
    // grays out in the UI but stays fully functional.
    startAt: timestamp('start_at', { withTimezone: true, mode: 'string' }),
    endAt: timestamp('end_at', { withTimezone: true, mode: 'string' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('modules_course_idx').on(t.courseId),
  }),
);

export const fileAssets = pgTable(
  'file_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
    bucket: text('bucket').notNull().default('coursewise-files'),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    originalFilename: text('original_filename'),
    status: fileAssetStatusEnum('status').notNull().default('pending'),
    relatedType: text('related_type'),
    relatedId: uuid('related_id'),
    etag: text('etag'),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('file_assets_course_idx').on(t.courseId),
    statusIdx: index('file_assets_status_idx').on(t.status),
  }),
);

export const presentations = pgTable(
  'presentations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    status: presentationStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    position: integer('position').notNull().default(0),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    externalUrl: text('external_url'),
    provider: text('provider'),
    fileAssetId: uuid('file_asset_id').references(() => fileAssets.id, { onDelete: 'set null' }),
    // Public share. shareToken is minted on first enable and re-used on
    // toggle so the URL stays stable; shareEnabled gates whether the public
    // viewer renders.
    shareToken: text('share_token'),
    shareEnabled: boolean('share_enabled').notNull().default(false),
    shareEnabledAt: timestamp('share_enabled_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('presentations_course_idx').on(t.courseId),
    moduleIdx: index('presentations_module_idx').on(t.moduleId),
    statusIdx: index('presentations_status_idx').on(t.status),
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
    content: text('content'),
    speakerNotes: text('speaker_notes'),
    layout: text('layout'),
    imageAssetId: uuid('image_asset_id').references(() => fileAssets.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => ({
    presentationIdx: index('slides_presentation_idx').on(t.presentationId),
  }),
);

export const gammaJobStatusEnum = pgEnum('gamma_job_status', [
  'pending',
  'completed',
  'failed',
]);

export const gammaGenerationJobs = pgTable(
  'gamma_generation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    presentationId: uuid('presentation_id').references(() => presentations.id, {
      onDelete: 'set null',
    }),
    requestedById: uuid('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    status: gammaJobStatusEnum('status').notNull().default('pending'),
    gammaGenerationId: text('gamma_generation_id'),
    gammaUrl: text('gamma_url'),
    exportUrl: text('export_url'),
    errorMessage: text('error_message'),
    materialIds: uuid('material_ids').array().notNull(),
    requestParams: jsonb('request_params').notNull(),
    creditsDeducted: integer('credits_deducted'),
    creditsRemaining: integer('credits_remaining'),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('gamma_generation_jobs_course_idx').on(t.courseId),
    statusIdx: index('gamma_generation_jobs_status_idx').on(t.status),
    presentationIdx: index('gamma_generation_jobs_presentation_idx').on(t.presentationId),
  }),
);

export const readingMaterials = pgTable(
  'reading_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    type: text('type').notNull().default('document'),
    sourceType: materialSourceTypeEnum('source_type').notNull().default('manual_text'),
    content: text('content'),
    externalUrl: text('external_url'),
    fileAssetId: uuid('file_asset_id').references(() => fileAssets.id, {
      onDelete: 'set null',
    }),
    status: materialStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    position: integer('position').notNull().default(0),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('reading_materials_course_idx').on(t.courseId),
    moduleIdx: index('reading_materials_module_idx').on(t.moduleId),
    statusIdx: index('reading_materials_status_idx').on(t.status),
  }),
);

export const assignmentGroups = pgTable(
  'assignment_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    weight: integer('weight').notNull(),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('assignment_groups_course_idx').on(t.courseId),
    nameUnique: uniqueIndex('assignment_groups_course_name_idx').on(
      t.courseId,
      sql`lower(${t.name})`,
    ),
  }),
);

export type AssignmentGroupRow = typeof assignmentGroups.$inferSelect;

// Roll-up rule for an assignment set: how its member assignments collapse to a
// single score that then counts as one item inside a weighted category.
export const assignmentSetRuleEnum = pgEnum('assignment_set_rule', ['average', 'highest', 'weighted']);

// Assignment set: a bundle of selected assignments whose members are graded
// individually but contribute ONE rolled-up score (average / best-of) to the
// weighted category referenced by `groupId`. Distinct from "group sets"
// (groupSets / groupSetId), which are student collaboration groups.
export const assignmentSets = pgTable(
  'assignment_sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => assignmentGroups.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    scoringRule: assignmentSetRuleEnum('scoring_rule').notNull().default('average'),
    // Per-member weights for the 'weighted' rule: { [assignmentId]: weight }.
    // Missing members default to weight 1; stale keys are ignored.
    weightsJson: jsonb('weights_json'),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('assignment_sets_course_idx').on(t.courseId),
    nameUnique: uniqueIndex('assignment_sets_course_name_idx').on(
      t.courseId,
      sql`lower(${t.name})`,
    ),
  }),
);

export type AssignmentSetRow = typeof assignmentSets.$inferSelect;

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    groupId: uuid('group_id').references(() => assignmentGroups.id, { onDelete: 'set null' }),
    // Membership in an assignment set (mutually exclusive with a direct
    // `groupId` for grading purposes — when set, the set supplies the category).
    setId: uuid('set_id').references(() => assignmentSets.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: timestamp('due_date', { withTimezone: true, mode: 'string' }),
    // Scheduling window (migration 0021). `startDate` and `endDate` gate
    // whether a student can open / start work on this assignment;
    // `untilDate` is the hard cutoff for actually submitting drafts that
    // were started inside the window. Order is application-enforced:
    // startDate ≤ endDate ≤ untilDate.
    startDate: timestamp('start_date', { withTimezone: true, mode: 'string' }),
    endDate: timestamp('end_date', { withTimezone: true, mode: 'string' }),
    untilDate: timestamp('until_date', { withTimezone: true, mode: 'string' }),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }),
    rubric: jsonb('rubric'),
    allowLateSubmission: boolean('allow_late_submission').notNull().default(false),
    // Late-submission penalty policy (migration 0032). Only meaningful when
    // allowLateSubmission is true; all null ⇒ late allowed with no deduction.
    // Deduct `late_penalty_percent_per_period`% for each started
    // `late_penalty_period_hours` window past the deadline, capped at
    // `late_penalty_max_percent`%.
    latePenaltyPercentPerPeriod: numeric('late_penalty_percent_per_period', {
      precision: 5,
      scale: 2,
    }),
    latePenaltyPeriodHours: integer('late_penalty_period_hours'),
    latePenaltyMaxPercent: numeric('late_penalty_max_percent', { precision: 5, scale: 2 }),
    attachmentFileId: uuid('attachment_file_id').references(() => fileAssets.id, {
      onDelete: 'set null',
    }),
    status: assignmentStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    position: integer('position').notNull().default(0),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    // Group-mode submission: when 'group', groupSetId must point at a set
    // in the same course (enforced by API + DB CHECK in migration 0020).
    submissionMode: submissionModeEnum('submission_mode').notNull().default('individual'),
    groupSetId: uuid('group_set_id').references(() => groupSets.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('assignments_course_idx').on(t.courseId),
    moduleIdx: index('assignments_module_idx').on(t.moduleId),
    statusIdx: index('assignments_status_idx').on(t.status),
  }),
);

// Shared content for one group's submission to a group-mode assignment.
// Each row is the team's "work product" (text + optional file). Per-member
// rows in assignment_submissions link via group_submission_id so the grade
// can still differ per member (e.g. unequal contribution).
export const groupSubmissions = pgTable(
  'group_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    content: text('content'),
    fileAssetId: uuid('file_asset_id').references(() => fileAssets.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }),
    submittedById: uuid('submitted_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => ({
    assignmentGroupUnique: uniqueIndex('group_submissions_assignment_group_idx').on(
      t.assignmentId,
      t.groupId,
    ),
  }),
);

export type GroupSubmissionRow = typeof groupSubmissions.$inferSelect;

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
    status: submissionStatusEnum('status').notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }),
    content: text('content'),
    fileAssetId: uuid('file_asset_id').references(() => fileAssets.id, {
      onDelete: 'set null',
    }),
    // For group-mode assignments, content/fileAssetId/submittedAt on this
    // row are unused — the canonical values live on group_submissions. The
    // grading fields stay per-row so per-member adjustments work.
    groupSubmissionId: uuid('group_submission_id').references(() => groupSubmissions.id, {
      onDelete: 'set null',
    }),
    score: numeric('score', { precision: 6, scale: 2 }),
    // Late-penalty snapshot (migration 0032): `rawScore` is the pre-penalty
    // score the teacher entered, `latePenaltyPercent` is the deduction applied
    // at grade time (0 when none/waived), and `score` above is the final value.
    rawScore: numeric('raw_score', { precision: 6, scale: 2 }),
    latePenaltyPercent: numeric('late_penalty_percent', { precision: 5, scale: 2 }),
    latePenaltyWaived: boolean('late_penalty_waived').notNull().default(false),
    feedback: text('feedback'),
    gradedAt: timestamp('graded_at', { withTimezone: true, mode: 'string' }),
    gradedById: uuid('graded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => ({
    assignmentStudentUnique: uniqueIndex('assignment_submissions_assignment_student_idx').on(
      t.assignmentId,
      t.studentId,
    ),
    groupSubmissionIdx: index('assignment_submissions_group_submission_idx').on(
      t.groupSubmissionId,
    ),
    gradedAtIdx: index('assignment_submissions_graded_at_idx').on(t.gradedAt),
    submittedAtIdx: index('assignment_submissions_submitted_at_idx').on(t.submittedAt),
  }),
);

export const discussionTopics = pgTable(
  'discussion_topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    groupId: uuid('group_id').references(() => assignmentGroups.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    prompt: text('prompt'),
    status: discussionTopicStatusEnum('status').notNull().default('draft'),
    isGraded: boolean('is_graded').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('discussion_topics_course_idx').on(t.courseId),
    moduleIdx: index('discussion_topics_module_idx').on(t.moduleId),
    statusIdx: index('discussion_topics_status_idx').on(t.status),
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
    content: text('content'),
    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    topicIdx: index('discussion_posts_topic_idx').on(t.topicId),
    parentIdx: index('discussion_posts_parent_idx').on(t.parentId),
    // Per-student lookups: author-mode post pages + grades postCount.
    topicAuthorIdx: index('discussion_posts_topic_author_idx').on(t.topicId, t.authorId),
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

// Roll-up rule for a quiz set: how its member quizzes collapse to a single
// score that then counts as one item inside a weighted category. Parallel to
// assignmentSetRuleEnum; kept separate so the two can diverge later.
export const quizSetRuleEnum = pgEnum('quiz_set_rule', ['average', 'highest', 'weighted']);

// Quiz set: a bundle of selected quizzes graded individually but contributing
// ONE rolled-up score (average / best-of) to the weighted category referenced
// by `groupId`. The quiz twin of `assignmentSets`. Distinct from `quizSchedules`
// (tester waves) and `groupSets` (student collaboration groups).
export const quizSets = pgTable(
  'quiz_sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => assignmentGroups.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    scoringRule: quizSetRuleEnum('scoring_rule').notNull().default('average'),
    // Per-member weights for the 'weighted' rule: { [quizId]: weight }.
    weightsJson: jsonb('weights_json'),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('quiz_sets_course_idx').on(t.courseId),
    nameUnique: uniqueIndex('quiz_sets_course_name_idx').on(t.courseId, sql`lower(${t.name})`),
  }),
);

export type QuizSetRow = typeof quizSets.$inferSelect;

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    groupId: uuid('group_id').references(() => assignmentGroups.id, { onDelete: 'set null' }),
    // Membership in a quiz set (mutually exclusive with a direct `groupId` for
    // grading purposes — when set, the set supplies the category).
    setId: uuid('set_id').references(() => quizSets.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    status: quizStatusEnum('status').notNull().default('draft'),
    startTime: timestamp('start_time', { withTimezone: true, mode: 'string' }),
    endTime: timestamp('end_time', { withTimezone: true, mode: 'string' }),
    // Hard cutoff for any in-progress attempt (migration 0021). When set,
    // attempt expiresAt is capped to min(startedAt + timeLimit, untilDate)
    // — whichever comes first.
    untilDate: timestamp('until_date', { withTimezone: true, mode: 'string' }),
    timeLimitMinutes: integer('time_limit_minutes'),
    maxAttempts: integer('max_attempts').notNull().default(1),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }),
    passingScore: numeric('passing_score', { precision: 6, scale: 2 }),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('quizzes_course_idx').on(t.courseId),
    moduleIdx: index('quizzes_module_idx').on(t.moduleId),
    statusIdx: index('quizzes_status_idx').on(t.status),
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
    explanation: text('explanation'),
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
    status: quizAttemptStatusEnum('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }),
    score: numeric('score', { precision: 6, scale: 2 }),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }),
    teacherReviewed: boolean('teacher_reviewed').notNull().default(false),
    gradedAt: timestamp('graded_at', { withTimezone: true, mode: 'string' }),
    gradedById: uuid('graded_by_id').references(() => users.id, { onDelete: 'set null' }),
    // Which tester schedule (wave) governed this attempt's window. null for
    // ungated quizzes or attempts created before schedules existed. set null on
    // wave delete so attempt history survives.
    scheduleId: uuid('schedule_id').references(() => quizSchedules.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => ({
    quizStudentIdx: index('quiz_attempts_quiz_student_idx').on(t.quizId, t.studentId),
    scheduleIdx: index('quiz_attempts_schedule_idx').on(t.scheduleId),
    statusIdx: index('quiz_attempts_status_idx').on(t.status),
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
    feedback: text('feedback'),
    gradedById: uuid('graded_by_id').references(() => users.id, { onDelete: 'set null' }),
    gradedAt: timestamp('graded_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    attemptIdx: index('quiz_answers_attempt_idx').on(t.attemptId),
    attemptQuestionUnique: uniqueIndex('quiz_answers_attempt_question_idx').on(
      t.attemptId,
      t.questionId,
    ),
  }),
);

// ---------- Quiz tester schedules (staggered / waved availability) ----------
// When a quiz has ≥1 schedule row, access is GATED: only students assigned to a
// wave (or absorbed by the remainder wave) may start an attempt. Zero schedules
// = today's global-window behavior, unchanged. Each wave may override any of the
// quiz's window/limit fields; null = inherit the quiz value.
export const quizSchedules = pgTable(
  'quiz_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    // The remainder wave's membership is DYNAMIC: all enrolled students with no
    // explicit member row. At most one per quiz (partial unique below).
    isRemainder: boolean('is_remainder').notNull().default(false),
    // Per-wave overrides. null => inherit the quiz-level value.
    startTime: timestamp('start_time', { withTimezone: true, mode: 'string' }),
    endTime: timestamp('end_time', { withTimezone: true, mode: 'string' }),
    untilDate: timestamp('until_date', { withTimezone: true, mode: 'string' }),
    timeLimitMinutes: integer('time_limit_minutes'),
    maxAttempts: integer('max_attempts'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => ({
    quizIdx: index('quiz_schedules_quiz_idx').on(t.quizId),
    // At most one remainder wave per quiz.
    oneRemainderPerQuiz: uniqueIndex('quiz_schedules_one_remainder_idx')
      .on(t.quizId)
      .where(sql`${t.isRemainder} = true`),
  }),
);

export const quizScheduleMembers = pgTable(
  'quiz_schedule_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => quizSchedules.id, { onDelete: 'cascade' }),
    // quizId denormalized so "one wave per (quiz, student)" can be a DB
    // constraint (mirrors groupMemberships denormalizing group_set_id).
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Wave-open notification idempotency marker. Set by the cron sweep; reset to
    // null when the member moves waves or the wave's window changes.
    notifiedAt: timestamp('notified_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    scheduleIdx: index('quiz_schedule_members_schedule_idx').on(t.scheduleId),
    quizStudentUnique: uniqueIndex('quiz_schedule_members_quiz_student_idx').on(
      t.quizId,
      t.studentId,
    ),
    notifyIdx: index('quiz_schedule_members_notify_idx').on(t.notifiedAt),
  }),
);

// ---------- Student groups (Canvas-style group sets) ----------
// A course can have many named groupSets ("Lab Groups", "Project Teams").
// Each set contains N groups, each with a member cap. Students belong to at
// most one group per set (enforced by unique(groupSetId, studentId) on
// memberships — the set id is denormalized onto the membership row so the
// constraint can be expressed at the DB level).
export const groupSets = pgTable(
  'group_sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    maxMembersPerGroup: integer('max_members_per_group').notNull(),
    signupMode: groupSetSignupModeEnum('signup_mode').notNull().default('self_signup'),
    signupStatus: groupSetSignupStatusEnum('signup_status').notNull().default('open'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('group_sets_course_idx').on(t.courseId),
    nameUnique: uniqueIndex('group_sets_course_name_idx').on(t.courseId, sql`lower(${t.name})`),
  }),
);

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupSetId: uuid('group_set_id')
      .notNull()
      .references(() => groupSets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    // NULL inherits group_sets.max_members_per_group. Set to bump a single
    // group's cap when teacher/admin force-assigns a student into a full
    // group; the bump is persistent (cap survives subsequent reads).
    maxMembersOverride: integer('max_members_override'),
    ...timestamps,
  },
  (t) => ({
    groupSetIdx: index('groups_group_set_idx').on(t.groupSetId),
    nameUnique: uniqueIndex('groups_set_name_idx').on(t.groupSetId, sql`lower(${t.name})`),
  }),
);

export const groupMemberships = pgTable(
  'group_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupSetId: uuid('group_set_id')
      .notNull()
      .references(() => groupSets.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    setStudentUnique: uniqueIndex('group_memberships_set_student_idx').on(t.groupSetId, t.studentId),
    groupIdx: index('group_memberships_group_idx').on(t.groupId),
    studentIdx: index('group_memberships_student_idx').on(t.studentId),
  }),
);

export type GroupSetRow = typeof groupSets.$inferSelect;
export type GroupRow = typeof groups.$inferSelect;
export type GroupMembershipRow = typeof groupMemberships.$inferSelect;

export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    sessionDate: timestamp('session_date', { withTimezone: true, mode: 'string' }).notNull(),
    status: attendanceSessionStatusEnum('status').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    lateAfterMinutes: integer('late_after_minutes'),
    absentAfterMinutes: integer('absent_after_minutes'),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('attendance_sessions_course_idx').on(t.courseId),
    statusIdx: index('attendance_sessions_status_idx').on(t.status),
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
    notes: text('notes'),
    recordedById: uuid('recorded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    ipAddress: text('ip_address'),
    ...timestamps,
  },
  (t) => ({
    sessionStudentUnique: uniqueIndex('attendance_records_session_student_idx').on(
      t.sessionId,
      t.studentId,
    ),
  }),
);

export const gradingPolicies = pgTable(
  'grading_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    weightAttendance: integer('weight_attendance').notNull().default(10),
    lettersJson: jsonb('letters_json'),
    version: integer('version').notNull().default(1),
    updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => ({
    courseUnique: uniqueIndex('grading_policies_course_idx').on(t.courseId),
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
    categoryScores: jsonb('category_scores'),
    gradingPolicySnapshot: jsonb('grading_policy_snapshot'),
    isOutdated: boolean('is_outdated').notNull().default(false),
    teacherOverrideScore: numeric('teacher_override_score', { precision: 6, scale: 2 }),
    teacherOverrideReason: text('teacher_override_reason'),
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
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
    type: alertTypeEnum('type').notNull(),
    severity: alertSeverityEnum('severity').notNull().default('warning'),
    status: alertStatusEnum('status').notNull().default('open'),
    title: text('title').notNull(),
    body: text('body'),
    linkUrl: text('link_url'),
    metadataJson: jsonb('metadata_json'),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
    resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    ...timestamps,
  },
  (t) => ({
    userIdx: index('alerts_user_idx').on(t.userId),
    courseIdx: index('alerts_course_idx').on(t.courseId),
    statusIdx: index('alerts_status_idx').on(t.status),
    openTypeUnique: uniqueIndex('alerts_open_type_idx')
      .on(t.userId, t.courseId, t.type)
      .where(sql`${t.status} = 'open'`),
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
    // FERPA §99.32(a) — when this row records a disclosure of a specific
    // student's education records, populate this column so we can produce
    // "all disclosures of student X" on demand. Bulk disclosures (CSV
    // exports, multi-student AI sends) write one row per affected student.
    disclosedStudentId: uuid('disclosed_student_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    actorUserIdx: index('audit_logs_actor_user_idx').on(t.actorUserId),
    actionIdx: index('audit_logs_action_idx').on(t.action),
    createdIdx: index('audit_logs_created_idx').on(t.createdAt),
    disclosedStudentIdx: index('audit_logs_disclosed_student_idx').on(
      t.disclosedStudentId,
      t.createdAt,
    ),
  }),
);

export const teacherInvitations = pgTable(
  'teacher_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' }),
    acceptedUserId: uuid('accepted_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('teacher_invitations_token_hash_idx').on(t.tokenHash),
    emailIdx: index('teacher_invitations_email_idx').on(sql`lower(${t.email})`),
    expiresAtIdx: index('teacher_invitations_expires_at_idx').on(t.expiresAt),
    pendingEmailUnique: uniqueIndex('teacher_invitations_pending_email_idx')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
  }),
);

export const aiProviders = pgTable(
  'ai_providers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: aiProviderKindEnum('kind').notNull(),
    displayName: text('display_name').notNull(),
    // Name of the Worker secret that holds the API key for this provider
    // (e.g. 'ANTHROPIC_API_KEY'). The secret value itself never lives in the DB.
    apiKeySecretRef: text('api_key_secret_ref').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    kindUnique: uniqueIndex('ai_providers_kind_unique').on(t.kind),
  }),
);

export const aiModels = pgTable(
  'ai_models',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => aiProviders.id, { onDelete: 'cascade' }),
    modelId: text('model_id').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    costInPer1m: numeric('cost_in_per_1m', { precision: 12, scale: 4 }),
    costOutPer1m: numeric('cost_out_per_1m', { precision: 12, scale: 4 }),
    capabilities: jsonb('capabilities').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => ({
    providerModelUnique: uniqueIndex('ai_models_provider_model_unique').on(t.providerId, t.modelId),
  }),
);

export const aiGenerationJobs = pgTable(
  'ai_generation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    modelId: uuid('model_id')
      .notNull()
      .references(() => aiModels.id, { onDelete: 'restrict' }),
    status: aiJobStatusEnum('status').notNull().default('queued'),
    request: jsonb('request').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    costCents: integer('cost_cents'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('ai_generation_jobs_course_idx').on(t.courseId),
    statusIdx: index('ai_generation_jobs_status_idx').on(t.status),
  }),
);

export const aiGenerationArtifacts = pgTable(
  'ai_generation_artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => aiGenerationJobs.id, { onDelete: 'cascade' }),
    kind: aiArtifactKindEnum('kind').notNull(),
    // Populated when the artifact row has been created in its target table
    // (materials/assignments/etc.). Polymorphic, not enforced as a real FK.
    artifactId: uuid('artifact_id'),
    moduleId: uuid('module_id'),
    status: aiArtifactStatusEnum('status').notNull().default('pending'),
    error: text('error'),
    ...timestamps,
  },
  (t) => ({
    jobIdx: index('ai_generation_artifacts_job_idx').on(t.jobId),
  }),
);

export const aiGenerationEvents = pgTable(
  'ai_generation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => aiGenerationJobs.id, { onDelete: 'cascade' }),
    artifactId: uuid('artifact_id').references(() => aiGenerationArtifacts.id, {
      onDelete: 'set null',
    }),
    level: aiEventLevelEnum('level').notNull().default('info'),
    type: text('type').notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    jobOccurredIdx: index('ai_generation_events_job_occurred_idx').on(t.jobId, t.occurredAt),
  }),
);

export type AiGenerationEventRow = typeof aiGenerationEvents.$inferSelect;

export const aiPromptTemplates = pgTable(
  'ai_prompt_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: aiArtifactKindEnum('kind').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    userMessage: text('user_message').notNull(),
    depthConfig: jsonb('depth_config').$type<AiPromptDepthConfig>().notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => ({
    kindIdx: uniqueIndex('ai_prompt_templates_kind_idx').on(t.kind),
  }),
);

export type AiPromptTemplateRow = typeof aiPromptTemplates.$inferSelect;

// Per-request AI chat usage accounting (token counts + estimated Cloudflare
// neurons). Deliberately stores NO message content — only counts and a
// human-readable context title snapshot — consistent with the tutor's
// no-chat-persistence privacy posture.
export const aiUsageEvents = pgTable(
  'ai_usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(), // e.g. 'material_tutor'
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    // Estimated Cloudflare Workers AI neurons for this call (billing unit).
    neurons: numeric('neurons', { precision: 12, scale: 2 }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    // Title snapshot of what the chat was grounded in (material title etc.).
    contextTitle: text('context_title'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('ai_usage_events_user_created_idx').on(t.userId, t.createdAt),
  }),
);

export type AiUsageEventRow = typeof aiUsageEvents.$inferSelect;

export const courseDeletionLog = pgTable('course_deletion_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').notNull(),
  courseCode: text('course_code').notNull(),
  courseTitle: text('course_title').notNull(),
  deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  childCounts: jsonb('child_counts').notNull(),
});

// Mirrors course_deletion_log for student-account hard deletes (typically
// invoked to recover from a wrong-email registration). user_id and
// deleted_by are uuid-only without FK constraints so the row survives
// when either side is later deleted.
export const userDeletionLog = pgTable(
  'user_deletion_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    userEmail: text('user_email').notNull(),
    userName: text('user_name').notNull(),
    userRole: text('user_role').notNull(),
    deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    reason: text('reason'),
    enrollmentCount: integer('enrollment_count').notNull(),
    emailStatus: text('email_status').notNull(),
    emailProviderId: text('email_provider_id'),
    childCounts: jsonb('child_counts').notNull(),
  },
  (t) => ({
    userIdx: index('user_deletion_log_user_idx').on(t.userId),
    deletedAtIdx: index('user_deletion_log_deleted_at_idx').on(t.deletedAt),
  }),
);

export const r2CleanupJobs = pgTable(
  'r2_cleanup_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id').notNull(),
    status: r2CleanupJobStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    statusCreatedIdx: index('r2_cleanup_jobs_status_created_idx')
      .on(t.status, t.createdAt)
      .where(sql`${t.status} in ('pending', 'running', 'failed')`),
  }),
);

// Teacher-requested course export: an async job that builds an organized ZIP
// (reading materials + gradable items + submissions + scores) into R2, then
// emails the requester an authenticated download link. The zip object is
// expired/cleaned by the nightly cron once `expires_at` has passed.
export const courseExportJobs = pgTable(
  'course_export_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    requestedById: uuid('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    status: courseExportStatusEnum('status').notNull().default('pending'),
    objectKey: text('object_key'),
    sizeBytes: integer('size_bytes'),
    error: text('error'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    courseCreatedIdx: index('course_export_jobs_course_created_idx').on(t.courseId, t.createdAt),
    expiresIdx: index('course_export_jobs_expires_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'done'`),
  }),
);

export type CourseExportJobRow = typeof courseExportJobs.$inferSelect;

// FERPA §99.20: every student can request a record they believe is
// inaccurate or misleading be corrected. This table is the queue of those
// requests with their resolution state. `target_id` is polymorphic by
// design — could point at a final_grades id, a submission id, etc. — and
// kept as text rather than a real FK so the schema doesn't fan out across
// every record-bearing table.
export const recordCorrectionRequests = pgTable(
  'record_correction_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    targetType: recordCorrectionTargetEnum('target_type').notNull(),
    targetId: text('target_id'),
    description: text('description').notNull(),
    status: recordCorrectionStatusEnum('status').notNull().default('open'),
    resolutionNote: text('resolution_note'),
    resolvedById: uuid('resolved_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('record_correction_requests_student_idx').on(t.studentId, t.createdAt),
    courseOpenIdx: index('record_correction_requests_course_open_idx')
      .on(t.courseId)
      .where(sql`${t.status} = 'open'`),
  }),
);

// FERPA §99.7(a) — annual acknowledgment of the FERPA rights notice.
// One row per (user, academic_year). The unique index doubles as the lookup
// index for "has this user acknowledged the current year yet?".
export const ferpaAcknowledgments = pgTable(
  'ferpa_acknowledgments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    academicYear: text('academic_year').notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => ({
    userYearUnique: uniqueIndex('ferpa_acknowledgments_user_year_idx').on(
      t.userId,
      t.academicYear,
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type TeacherInvitationRow = typeof teacherInvitations.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type AiProviderRow = typeof aiProviders.$inferSelect;
export type AiModelRow = typeof aiModels.$inferSelect;
export type AiGenerationJobRow = typeof aiGenerationJobs.$inferSelect;
export type AiGenerationArtifactRow = typeof aiGenerationArtifacts.$inferSelect;
export type CourseDeletionLogRow = typeof courseDeletionLog.$inferSelect;
export type R2CleanupJobRow = typeof r2CleanupJobs.$inferSelect;

export const messageThreads = pgTable(
  'message_threads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    participantAId: uuid('participant_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    participantBId: uuid('participant_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    lastMessageSenderId: uuid('last_message_sender_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    deletedByAAt: timestamp('deleted_by_a_at', { withTimezone: true, mode: 'string' }),
    deletedByBAt: timestamp('deleted_by_b_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => ({
    courseALastIdx: index('message_threads_course_a_last_idx').on(
      t.courseId,
      t.participantAId,
      t.lastMessageAt,
    ),
    courseBLastIdx: index('message_threads_course_b_last_idx').on(
      t.courseId,
      t.participantBId,
      t.lastMessageAt,
    ),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => messageThreads.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    priority: text('priority').notNull().default('normal'),
    // Optional single attachment (word/excel/pdf/code …) uploaded via
    // /files/upload with relatedType 'message'.
    fileAssetId: uuid('file_asset_id').references(() => fileAssets.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    readAtByRecipient: timestamp('read_at_by_recipient', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (t) => ({
    threadCreatedIdx: index('messages_thread_created_idx').on(t.threadId, t.createdAt),
  }),
);

export type MessageThreadRow = typeof messageThreads.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
