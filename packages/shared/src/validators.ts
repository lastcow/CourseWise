import { z } from 'zod';
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_TYPES,
  API_TOKEN_SCOPES,
  ATTENDANCE_STATUSES,
  COURSE_STATUSES,
  GAMMA_EXPORT_FORMATS,
  GAMMA_FORMATS,
  GAMMA_IMAGE_SOURCES,
  GAMMA_MAX_IMAGE_STYLE_CHARS,
  GAMMA_MAX_INSTRUCTIONS_CHARS,
  GAMMA_MAX_NUM_CARDS,
  GAMMA_MIN_NUM_CARDS,
  GAMMA_TEXT_AMOUNTS,
  GAMMA_TEXT_MODES,
  GROUP_SET_MAX_GROUPS,
  GROUP_SET_MAX_MEMBERS_PER_GROUP,
  GROUP_SET_SIGNUP_MODES,
  GROUP_SET_SIGNUP_STATUSES,
  MATERIAL_SOURCE_TYPES,
  MATERIAL_STATUSES,
  QUIZ_QUESTION_TYPES,
  RECORD_CORRECTION_TARGETS,
  SUPPORTED_LOCALES,
} from './constants';

export const emailSchema = z.string().email().max(254).toLowerCase().trim();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  invitationCode: z.string().trim().min(1).max(64),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(2048),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const updatePreferencesSchema = z.object({
  preferredLanguage: z.enum(SUPPORTED_LOCALES).optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

const isoDateString = z.string().datetime({ offset: true }).or(z.string().datetime());

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1),
  expiresAt: isoDateString.optional(),
});
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

export const TEACHER_INVITATION_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;

export const createTeacherInvitationSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120).optional(),
});
export type CreateTeacherInvitationInput = z.infer<typeof createTeacherInvitationSchema>;

export const listTeacherInvitationsQuerySchema = z.object({
  status: z.enum(TEACHER_INVITATION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListTeacherInvitationsQuery = z.infer<typeof listTeacherInvitationsQuerySchema>;

export const registerTeacherSchema = z.object({
  token: z.string().trim().min(1).max(256),
  name: z.string().trim().min(1).max(120),
  password: passwordSchema,
});
export type RegisterTeacherInput = z.infer<typeof registerTeacherSchema>;

// Self-service token creation: the server auto-binds scopes to the caller's
// role, so the client only needs a name and an optional lifetime.
export const createSelfApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  expiresInDays: z.number().int().positive().max(3650).optional().nullable(),
});
export type CreateSelfApiTokenInput = z.infer<typeof createSelfApiTokenSchema>;

export const gradingPolicySchema = z
  .object({
    attendance: z.number().int().min(0).max(100),
    assignments: z.number().int().min(0).max(100),
    quizzes: z.number().int().min(0).max(100),
    discussion: z.number().int().min(0).max(100),
    finalProject: z.number().int().min(0).max(100),
  })
  .refine((v) => v.attendance + v.assignments + v.quizzes + v.discussion + v.finalProject === 100, {
    message: 'Grading policy weights must sum to 100',
    path: ['gradingPolicy'],
  });
export type GradingPolicy = z.infer<typeof gradingPolicySchema>;

export const courseCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Course code may contain letters, digits, hyphens and underscores only',
  );

export const createCourseSchema = z.object({
  code: courseCodeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  termLabel: z.string().trim().max(120).optional().nullable(),
  status: z.enum(COURSE_STATUSES).optional(),
  teacherId: z.string().uuid().optional(),
  gradingPolicy: gradingPolicySchema.optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z.object({
  code: courseCodeSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  termLabel: z.string().trim().max(120).optional().nullable(),
  status: z.enum(COURSE_STATUSES).optional(),
  gradingPolicy: gradingPolicySchema.optional(),
  bannerFileAssetId: z.string().uuid().nullable().optional(),
  syllabusMd: z.string().max(50_000).nullable().optional(),
  syllabusFileAssetId: z.string().uuid().nullable().optional(),
});
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const enrollStudentSchema = z.object({
  studentId: z.string().uuid(),
});
export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;

export const createModuleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
});
export type CreateModuleInput = z.infer<typeof createModuleSchema>;

export const updateModuleSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;

export const reorderModulesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
export type ReorderModulesInput = z.infer<typeof reorderModulesSchema>;

export const invitationCodeStringSchema = z
  .string()
  .trim()
  .min(4)
  .max(64)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Invitation code may contain letters, digits, hyphens and underscores',
  );

export const createInvitationCodeSchema = z.object({
  code: invitationCodeStringSchema.optional(),
  courseId: z.string().uuid().optional().nullable(),
  maxUses: z.number().int().positive().max(10_000).optional().nullable(),
  expiresAt: isoDateString.optional().nullable(),
});
export type CreateInvitationCodeInput = z.infer<typeof createInvitationCodeSchema>;

export const updateInvitationCodeSchema = z.object({
  courseId: z.string().uuid().optional().nullable(),
  maxUses: z.number().int().positive().max(10_000).optional().nullable(),
  expiresAt: isoDateString.optional().nullable(),
  status: z.enum(['active', 'revoked']).optional(),
});
export type UpdateInvitationCodeInput = z.infer<typeof updateInvitationCodeSchema>;

export const validateInvitationCodeSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
export type ValidateInvitationCodeInput = z.infer<typeof validateInvitationCodeSchema>;

export const redeemInvitationCodeSchema = z.object({
  code: invitationCodeStringSchema,
});
export type RedeemInvitationCodeInput = z.infer<typeof redeemInvitationCodeSchema>;

const baseMaterialFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).optional().nullable(),
  type: z.string().trim().min(1).max(64).optional(),
  moduleId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional(),
  content: z.string().trim().max(100_000).optional().nullable(),
  externalUrl: z.string().trim().url().max(2048).optional().nullable(),
  fileAssetId: z.string().uuid().optional().nullable(),
};

export const createMaterialSchema = z
  .object({
    ...baseMaterialFields,
    sourceType: z.enum(MATERIAL_SOURCE_TYPES),
  })
  .superRefine((val, ctx) => {
    if (val.sourceType === 'upload' && !val.fileAssetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fileAssetId is required for upload materials',
        path: ['fileAssetId'],
      });
    }
    if (val.sourceType === 'external_link' && !val.externalUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'externalUrl is required for external_link materials',
        path: ['externalUrl'],
      });
    }
    if (val.sourceType === 'manual_text' && !val.content) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'content is required for manual_text materials',
        path: ['content'],
      });
    }
  });
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

export const updateMaterialSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5_000).optional().nullable(),
    type: z.string().trim().min(1).max(64).optional(),
    moduleId: z.string().uuid().optional().nullable(),
    position: z.number().int().min(0).optional(),
    sourceType: z.enum(MATERIAL_SOURCE_TYPES).optional(),
    content: z.string().trim().max(100_000).optional().nullable(),
    externalUrl: z.string().trim().url().max(2048).optional().nullable(),
    fileAssetId: z.string().uuid().optional().nullable(),
    status: z.enum(MATERIAL_STATUSES).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.sourceType === 'upload' && val.fileAssetId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fileAssetId is required when sourceType is upload',
        path: ['fileAssetId'],
      });
    }
    if (val.sourceType === 'external_link' && val.externalUrl === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'externalUrl is required when sourceType is external_link',
        path: ['externalUrl'],
      });
    }
    if (val.sourceType === 'manual_text' && val.content === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'content is required when sourceType is manual_text',
        path: ['content'],
      });
    }
  });
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

// File uploads use POST /api/files/upload with multipart/form-data:
//   file:        binary
//   courseId:    uuid
//   relatedType: 'material' | 'assignment' | 'submission' (optional, default 'material')
// The Worker validates the file's name/type/size against the allowlists and
// streams it to R2 via the COURSE_FILES binding in a single request. There is
// no JSON schema for the request body — the validation lives inline in the
// route handler because zod doesn't model multipart shapes well.

// ---------- M3: Presentations ----------
export const createPresentationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  moduleId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional(),
  // When set, the presentation backs an uploaded file (PPTX/PDF/etc) and the
  // viewer renders a download/open action instead of the in-app slide editor.
  fileAssetId: z.string().uuid().optional().nullable(),
});
export type CreatePresentationInput = z.infer<typeof createPresentationSchema>;

export const updatePresentationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  moduleId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional(),
});
export type UpdatePresentationInput = z.infer<typeof updatePresentationSchema>;

export const togglePresentationShareSchema = z.object({
  enabled: z.boolean(),
});
export type TogglePresentationShareInput = z.infer<typeof togglePresentationShareSchema>;

// FERPA §99.20 — students submit corrections to records they believe are
// inaccurate. Description is 10–4000 chars: long enough to explain what's
// wrong, short enough that operators don't drown in walls of text.
export const createRecordCorrectionRequestSchema = z.object({
  courseId: z.string().uuid().optional().nullable(),
  targetType: z.enum(RECORD_CORRECTION_TARGETS),
  targetId: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().min(10).max(4000),
});
export type CreateRecordCorrectionRequestInput = z.infer<
  typeof createRecordCorrectionRequestSchema
>;

// Teacher resolution: must move to a terminal state. 'withdrawn' is the
// student's own action via a separate endpoint, so it's not allowed here.
export const resolveRecordCorrectionRequestSchema = z.object({
  status: z.enum(['accepted', 'declined']),
  resolutionNote: z.string().trim().max(4000).optional().nullable(),
});
export type ResolveRecordCorrectionRequestInput = z.infer<
  typeof resolveRecordCorrectionRequestSchema
>;

export const createSlideSchema = z.object({
  title: z.string().trim().max(200).optional().nullable(),
  content: z.string().trim().max(100_000).optional().nullable(),
  speakerNotes: z.string().trim().max(50_000).optional().nullable(),
  layout: z.string().trim().max(64).optional().nullable(),
  imageAssetId: z.string().uuid().optional().nullable(),
});
export type CreateSlideInput = z.infer<typeof createSlideSchema>;

export const updateSlideSchema = z.object({
  title: z.string().trim().max(200).optional().nullable(),
  content: z.string().trim().max(100_000).optional().nullable(),
  speakerNotes: z.string().trim().max(50_000).optional().nullable(),
  layout: z.string().trim().max(64).optional().nullable(),
  imageAssetId: z.string().uuid().optional().nullable(),
});
export type UpdateSlideInput = z.infer<typeof updateSlideSchema>;

export const reorderSlidesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
export type ReorderSlidesInput = z.infer<typeof reorderSlidesSchema>;

// ---------- M3: Assignments ----------
export const SUBMISSION_MODES = ['individual', 'group'] as const;
export type SubmissionMode = (typeof SUBMISSION_MODES)[number];

// Group-mode assignments must also send groupSetId. Enforced at the API
// layer (we let Zod accept the loose shape and validate the cross-field
// rule with a refine so error messages stay legible).
// Cross-field check shared by create + update: start ≤ end ≤ until. Skips
// any pair that's missing so a PATCH that only touches one field doesn't
// trip the rule.
function schedulingOrderOk(v: {
  startDate?: string | null;
  endDate?: string | null;
  untilDate?: string | null;
}): boolean {
  const start = v.startDate ? Date.parse(v.startDate) : null;
  const end = v.endDate ? Date.parse(v.endDate) : null;
  const until = v.untilDate ? Date.parse(v.untilDate) : null;
  if (start !== null && end !== null && start > end) return false;
  if (end !== null && until !== null && end > until) return false;
  if (start !== null && until !== null && start > until) return false;
  return true;
}

export const createAssignmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(20_000).optional().nullable(),
    moduleId: z.string().uuid().optional().nullable(),
    dueDate: isoDateString.optional().nullable(),
    startDate: isoDateString.optional().nullable(),
    endDate: isoDateString.optional().nullable(),
    untilDate: isoDateString.optional().nullable(),
    maxScore: z.number().min(0).max(1000).optional().nullable(),
    rubric: z.unknown().optional(),
    allowLateSubmission: z.boolean().optional(),
    attachmentFileId: z.string().uuid().optional().nullable(),
    position: z.number().int().min(0).optional(),
    submissionMode: z.enum(SUBMISSION_MODES).optional(),
    groupSetId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.submissionMode !== 'group' || !!v.groupSetId, {
    message: 'groupSetId is required when submissionMode is "group"',
    path: ['groupSetId'],
  })
  .refine(schedulingOrderOk, {
    message: 'Dates must satisfy startDate ≤ endDate ≤ untilDate',
    path: ['endDate'],
  });
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(20_000).optional().nullable(),
    moduleId: z.string().uuid().optional().nullable(),
    groupId: z.string().uuid().nullable().optional(),
    dueDate: isoDateString.optional().nullable(),
    startDate: isoDateString.optional().nullable(),
    endDate: isoDateString.optional().nullable(),
    untilDate: isoDateString.optional().nullable(),
    maxScore: z.number().min(0).max(1000).optional().nullable(),
    rubric: z.unknown().optional(),
    allowLateSubmission: z.boolean().optional(),
    attachmentFileId: z.string().uuid().optional().nullable(),
    position: z.number().int().min(0).optional(),
    submissionMode: z.enum(SUBMISSION_MODES).optional(),
    groupSetId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) => {
      // If caller is switching TO group mode, groupSetId must also be set
      // (either in this PATCH or already on the row — the API does the
      // post-merge check).
      if (v.submissionMode === 'group' && v.groupSetId === null) return false;
      return true;
    },
    {
      message: 'groupSetId cannot be null when submissionMode is "group"',
      path: ['groupSetId'],
    },
  )
  .refine(schedulingOrderOk, {
    message: 'Dates must satisfy startDate ≤ endDate ≤ untilDate',
    path: ['endDate'],
  });
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

// ---------- M3: Submissions ----------
export const updateSubmissionSchema = z.object({
  textAnswer: z.string().trim().max(100_000).optional().nullable(),
  fileAssetId: z.string().uuid().optional().nullable(),
});
export type UpdateSubmissionInput = z.infer<typeof updateSubmissionSchema>;

export const gradeSubmissionSchema = z.object({
  score: z.number().min(0).max(1000),
  feedback: z.string().trim().max(20_000).optional().nullable(),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;

export const returnSubmissionSchema = z.object({
  feedback: z.string().trim().max(20_000).optional().nullable(),
});
export type ReturnSubmissionInput = z.infer<typeof returnSubmissionSchema>;

// ---------- M3: Discussions ----------
export const createDiscussionTopicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20_000).optional().nullable(),
  moduleId: z.string().uuid().optional().nullable(),
  isGraded: z.boolean().optional(),
  maxScore: z.number().min(0).max(1000).optional().nullable(),
  isPinned: z.boolean().optional(),
});
export type CreateDiscussionTopicInput = z.infer<typeof createDiscussionTopicSchema>;

export const updateDiscussionTopicSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20_000).optional().nullable(),
  moduleId: z.string().uuid().optional().nullable(),
  groupId: z.string().uuid().nullable().optional(),
  isGraded: z.boolean().optional(),
  maxScore: z.number().min(0).max(1000).optional().nullable(),
  isPinned: z.boolean().optional(),
});
export type UpdateDiscussionTopicInput = z.infer<typeof updateDiscussionTopicSchema>;

export const createDiscussionPostSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  parentPostId: z.string().uuid().optional().nullable(),
});
export type CreateDiscussionPostInput = z.infer<typeof createDiscussionPostSchema>;

export const updateDiscussionPostSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
});
export type UpdateDiscussionPostInput = z.infer<typeof updateDiscussionPostSchema>;

export const replyDiscussionPostSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
});
export type ReplyDiscussionPostInput = z.infer<typeof replyDiscussionPostSchema>;

export const gradeDiscussionSchema = z.object({
  score: z.number().min(0).max(1000),
  feedback: z.string().trim().max(20_000).optional().nullable(),
});
export type GradeDiscussionInput = z.infer<typeof gradeDiscussionSchema>;

// ---------- M4: Quizzes ----------
// For quizzes, startTime / endTime double as the "start_date" / "end_date"
// from the scheduling design — they already gate when an attempt can be
// opened. untilDate is a hard absolute cutoff that caps in-progress
// attempts' expiresAt to min(startedAt + timeLimit, untilDate).
function quizSchedulingOrderOk(v: {
  startTime?: string | null;
  endTime?: string | null;
  untilDate?: string | null;
}): boolean {
  const start = v.startTime ? Date.parse(v.startTime) : null;
  const end = v.endTime ? Date.parse(v.endTime) : null;
  const until = v.untilDate ? Date.parse(v.untilDate) : null;
  if (start !== null && end !== null && start > end) return false;
  if (end !== null && until !== null && end > until) return false;
  if (start !== null && until !== null && start > until) return false;
  return true;
}

export const createQuizSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(20_000).optional().nullable(),
    moduleId: z.string().uuid().optional().nullable(),
    startTime: isoDateString.optional().nullable(),
    endTime: isoDateString.optional().nullable(),
    untilDate: isoDateString.optional().nullable(),
    timeLimitMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .optional()
      .nullable(),
    maxAttempts: z.number().int().positive().max(100).optional(),
    passingScore: z.number().min(0).max(1000).optional().nullable(),
  })
  .refine(quizSchedulingOrderOk, {
    message: 'Dates must satisfy startTime ≤ endTime ≤ untilDate',
    path: ['endTime'],
  });
export type CreateQuizInput = z.infer<typeof createQuizSchema>;

export const updateQuizSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(20_000).optional().nullable(),
    moduleId: z.string().uuid().optional().nullable(),
    groupId: z.string().uuid().nullable().optional(),
    startTime: isoDateString.optional().nullable(),
    endTime: isoDateString.optional().nullable(),
    untilDate: isoDateString.optional().nullable(),
    timeLimitMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .optional()
      .nullable(),
    maxAttempts: z.number().int().positive().max(100).optional(),
    passingScore: z.number().min(0).max(1000).optional().nullable(),
  })
  .refine(quizSchedulingOrderOk, {
    message: 'Dates must satisfy startTime ≤ endTime ≤ untilDate',
    path: ['endTime'],
  });
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;

const choiceOptionsSchema = z.array(z.string().trim().min(1).max(2000)).min(2).max(20);

const baseQuizQuestionFields = {
  prompt: z.string().trim().min(1).max(20_000),
  type: z.enum(QUIZ_QUESTION_TYPES),
  options: choiceOptionsSchema.optional().nullable(),
  correctAnswers: z.unknown().optional(),
  explanation: z.string().trim().max(20_000).optional().nullable(),
  points: z.number().min(0).max(1000).optional(),
  position: z.number().int().min(0).optional(),
};

export const createQuizQuestionSchema = z.object(baseQuizQuestionFields).superRefine((val, ctx) => {
  if (val.type === 'single_choice' || val.type === 'multiple_choice') {
    if (!val.options || val.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Choice questions require at least two options',
      });
    }
  }
  if (val.type === 'true_false') {
    // Coerce options to ['true', 'false'] later in service if missing.
    if (val.correctAnswers != null) {
      const ok =
        val.correctAnswers === true ||
        val.correctAnswers === false ||
        val.correctAnswers === 'true' ||
        val.correctAnswers === 'false';
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctAnswers'],
          message: 'true_false correctAnswers must be true or false',
        });
      }
    }
  }
});
export type CreateQuizQuestionInput = z.infer<typeof createQuizQuestionSchema>;

export const updateQuizQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000).optional(),
  options: choiceOptionsSchema.optional().nullable(),
  correctAnswers: z.unknown().optional(),
  explanation: z.string().trim().max(20_000).optional().nullable(),
  points: z.number().min(0).max(1000).optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateQuizQuestionInput = z.infer<typeof updateQuizQuestionSchema>;

export const reorderQuizQuestionsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
export type ReorderQuizQuestionsInput = z.infer<typeof reorderQuizQuestionsSchema>;

export const quizAnswerInputSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.unknown(),
});
export type QuizAnswerInput = z.infer<typeof quizAnswerInputSchema>;

export const saveQuizAttemptAnswersSchema = z.object({
  answers: z.array(quizAnswerInputSchema).max(500),
});
export type SaveQuizAttemptAnswersInput = z.infer<typeof saveQuizAttemptAnswersSchema>;

export const submitQuizAttemptSchema = z.object({
  answers: z.array(quizAnswerInputSchema).max(500).optional(),
});
export type SubmitQuizAttemptInput = z.infer<typeof submitQuizAttemptSchema>;

export const gradeQuizAnswerSchema = z.object({
  pointsAwarded: z.number().min(0).max(1000),
  feedback: z.string().trim().max(20_000).optional().nullable(),
});
export type GradeQuizAnswerInput = z.infer<typeof gradeQuizAnswerSchema>;

// ---------- M4: Attendance ----------
// Self-sign cut-offs in minutes. Bounded at 24h so a typo can't turn into a
// week-long window; nullable to allow "no cut-off" sessions.
const thresholdMinutes = z.number().int().min(0).max(1440).nullable().optional();

function refineThresholdOrder<T extends { lateAfterMinutes?: number | null; absentAfterMinutes?: number | null }>(
  schema: z.ZodType<T>,
): z.ZodEffects<z.ZodType<T>, T, T> {
  return schema.refine(
    (v) =>
      v.lateAfterMinutes == null ||
      v.absentAfterMinutes == null ||
      v.absentAfterMinutes >= v.lateAfterMinutes,
    {
      message: 'absentAfterMinutes must be >= lateAfterMinutes',
      path: ['absentAfterMinutes'],
    },
  );
}

export const createAttendanceSessionSchema = refineThresholdOrder(
  z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(20_000).optional().nullable(),
    sessionDate: isoDateString,
    lateAfterMinutes: thresholdMinutes,
    absentAfterMinutes: thresholdMinutes,
  }),
);
export type CreateAttendanceSessionInput = z.infer<typeof createAttendanceSessionSchema>;

export const updateAttendanceSessionSchema = refineThresholdOrder(
  z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(20_000).optional().nullable(),
    sessionDate: isoDateString.optional(),
    lateAfterMinutes: thresholdMinutes,
    absentAfterMinutes: thresholdMinutes,
  }),
);
export type UpdateAttendanceSessionInput = z.infer<typeof updateAttendanceSessionSchema>;

export const attendanceRecordInputSchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(ATTENDANCE_STATUSES),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type AttendanceRecordInput = z.infer<typeof attendanceRecordInputSchema>;

export const bulkMarkAttendanceSchema = z.object({
  records: z.array(attendanceRecordInputSchema).min(1).max(500),
});
export type BulkMarkAttendanceInput = z.infer<typeof bulkMarkAttendanceSchema>;

// ---------- M5: Grading Policy ----------
export const letterGradeThresholdSchema = z.object({
  letter: z.string().trim().min(1).max(4),
  minScore: z.number().min(0).max(100),
});
export type LetterGradeThresholdInput = z.infer<typeof letterGradeThresholdSchema>;

export const updateGradingPolicySchema = z.object({
  weightAttendance: z.number().int().min(0).max(100),
  letters: z.array(letterGradeThresholdSchema).min(1).max(10).optional().nullable(),
});
export type UpdateGradingPolicyInput = z.infer<typeof updateGradingPolicySchema>;

// ---------- M5: Final Grades ----------
export const overrideFinalGradeSchema = z.object({
  teacherOverrideScore: z.number().min(0).max(100).nullable().optional(),
  teacherOverrideReason: z.string().trim().max(2000).nullable().optional(),
});
export type OverrideFinalGradeInput = z.infer<typeof overrideFinalGradeSchema>;

// ---------- M5: Alerts ----------
export const createManualAlertSchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid().optional().nullable(),
  type: z.enum(ALERT_TYPES).default('manual'),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(20_000).optional().nullable(),
  linkUrl: z.string().trim().url().max(2048).optional().nullable(),
});
export type CreateManualAlertInput = z.infer<typeof createManualAlertSchema>;

export const resolveAlertSchema = z.object({
  resolutionNote: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['resolved', 'dismissed']).optional(),
});
export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>;

export const listAlertsQuerySchema = z.object({
  status: z.enum(ALERT_STATUSES).optional(),
  type: z.enum(ALERT_TYPES).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;

// ---------- AI: providers & models (Phase 1) ----------
export const AI_PROVIDER_KINDS = ['anthropic', 'openai'] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export const AI_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'partial',
  'canceled',
] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export const AI_ARTIFACT_KINDS = [
  'material',
  'presentation',
  'assignment',
  'project',
  'quiz',
] as const;
export type AiArtifactKind = (typeof AI_ARTIFACT_KINDS)[number];

export const createAiProviderSchema = z.object({
  kind: z.enum(AI_PROVIDER_KINDS),
  displayName: z.string().trim().min(1).max(120),
  apiKeySecretRef: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Use UPPER_SNAKE_CASE matching the Worker secret name'),
  enabled: z.boolean().optional(),
});
export type CreateAiProviderInput = z.infer<typeof createAiProviderSchema>;

export const updateAiProviderSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  apiKeySecretRef: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
  enabled: z.boolean().optional(),
});
export type UpdateAiProviderInput = z.infer<typeof updateAiProviderSchema>;

export const createAiModelSchema = z.object({
  providerId: z.string().uuid(),
  modelId: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(120),
  enabled: z.boolean().optional(),
  costInPer1m: z.number().nonnegative().optional().nullable(),
  costOutPer1m: z.number().nonnegative().optional().nullable(),
});
export type CreateAiModelInput = z.infer<typeof createAiModelSchema>;

export const updateAiModelSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  costInPer1m: z.number().nonnegative().optional().nullable(),
  costOutPer1m: z.number().nonnegative().optional().nullable(),
});
export type UpdateAiModelInput = z.infer<typeof updateAiModelSchema>;

export interface AiProviderSummary {
  id: string;
  kind: AiProviderKind;
  displayName: string;
  apiKeySecretRef: string;
  enabled: boolean;
  // True if the Worker has a secret bound for this provider's secret ref.
  // Admin UI uses this to flag misconfigured providers without exposing keys.
  secretConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiModelSummary {
  id: string;
  providerId: string;
  providerKind: AiProviderKind;
  modelId: string;
  displayName: string;
  enabled: boolean;
  costInPer1m: number | null;
  costOutPer1m: number | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- AI: course-scoped generation (Phase 2) ----------

export const AI_GENERATION_LANGUAGES = ['en', 'zh-CN'] as const;
export type AiGenerationLanguage = (typeof AI_GENERATION_LANGUAGES)[number];

export const AI_GENERATION_DEPTHS = ['brief', 'standard', 'detailed'] as const;
export type AiGenerationDepth = (typeof AI_GENERATION_DEPTHS)[number];

/**
 * Phase 2 only supports `material`. The full enum is declared in shared so the
 * UI/types are stable when Phase 3 adds the rest.
 */
export const generateMaterialsSchema = z.object({
  modelId: z.string().uuid(),
  moduleIds: z.array(z.string().uuid()).min(1).max(50),
  language: z.enum(AI_GENERATION_LANGUAGES).optional(),
  depth: z.enum(AI_GENERATION_DEPTHS).optional(),
  instructions: z.string().trim().max(4000).optional(),
});
export type GenerateMaterialsInput = z.infer<typeof generateMaterialsSchema>;

export interface AiModelOption {
  id: string;
  providerKind: AiProviderKind;
  modelId: string;
  displayName: string;
  costInPer1m: number | null;
  costOutPer1m: number | null;
}

export interface AiJobSummary {
  id: string;
  status: AiJobStatus;
  modelDisplayName: string;
  artifactCount: number;
  succeededCount: number;
  failedCount: number;
  costCents: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface AiJobArtifact {
  id: string;
  kind: AiArtifactKind;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  moduleId: string | null;
  moduleTitle: string | null;
  artifactId: string | null;
  artifactTitle: string | null;
  error: string | null;
}

export interface AiJobEvent {
  id: string;
  artifactId: string | null;
  level: 'info' | 'warn' | 'error';
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  occurredAt: string; // ISO string
}

export interface AiJobDetail extends AiJobSummary {
  request: GenerateMaterialsInput;
  artifacts: AiJobArtifact[];
  events: AiJobEvent[]; // ordered ascending by occurredAt
}

// ---------- AI: editable prompt templates ----------

export interface AiPromptDepthEntry {
  wordTarget: string;
  maxTokens: number;
}

export interface AiPromptDepthConfig {
  brief: AiPromptDepthEntry;
  standard: AiPromptDepthEntry;
  detailed: AiPromptDepthEntry;
}

export interface AiPromptTemplate {
  id: string;
  kind: AiArtifactKind;
  systemPrompt: string;
  userMessage: string;
  depthConfig: AiPromptDepthConfig;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

const aiPromptDepthEntrySchema = z.object({
  wordTarget: z.string().trim().min(1).max(120),
  maxTokens: z.number().int().min(100).max(32000),
});

export const updateAiPromptTemplateSchema = z.object({
  systemPrompt: z.string().trim().min(1).max(8000),
  userMessage: z.string().trim().min(1).max(8000),
  depthConfig: z.object({
    brief: aiPromptDepthEntrySchema,
    standard: aiPromptDepthEntrySchema,
    detailed: aiPromptDepthEntrySchema,
  }),
});
export type UpdateAiPromptTemplateInput = z.infer<typeof updateAiPromptTemplateSchema>;

// ---------- Public: Contact form ----------
export const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  institution: z.string().trim().max(200).optional(),
  subject: z.enum(['sales', 'support', 'press', 'other']),
  message: z.string().trim().min(10).max(4000),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export const courseDeleteBodySchema = z.object({
  confirmCode: z.string().trim().min(1).max(64),
});

export const generateGammaPresentationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  moduleId: z.string().uuid().optional().nullable(),
  materialIds: z.array(z.string().uuid()).min(1).max(50),
  additionalInstructions: z
    .string()
    .trim()
    .max(GAMMA_MAX_INSTRUCTIONS_CHARS)
    .optional()
    .nullable(),
  themeId: z.string().trim().max(120).optional().nullable(),
  imageSource: z.enum(GAMMA_IMAGE_SOURCES).default('aiGenerated'),
  imageStyle: z.string().trim().max(GAMMA_MAX_IMAGE_STYLE_CHARS).optional().nullable(),
  amount: z.enum(GAMMA_TEXT_AMOUNTS).default('medium'),
  // Required by Gamma's public API. Default to `condense` since our typical
  // input is long-form reading material that should become a slide deck.
  textMode: z.enum(GAMMA_TEXT_MODES).default('condense'),
  // Number of slides to generate. Optional — Gamma picks a sensible count when
  // omitted.
  numCards: z
    .number()
    .int()
    .min(GAMMA_MIN_NUM_CARDS)
    .max(GAMMA_MAX_NUM_CARDS)
    .optional()
    .nullable(),
  exportAs: z.enum(GAMMA_EXPORT_FORMATS).default('pptx'),
  // The Gamma artifact format. Defaults to `presentation` to preserve prior
  // behaviour; teachers can pick `document`, `social`, or `webpage` instead.
  format: z.enum(GAMMA_FORMATS).default('presentation'),
});
export type GenerateGammaPresentationInput = z.infer<typeof generateGammaPresentationSchema>;

export const createAssignmentGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  weight: z.number().int().min(0).max(100),
  position: z.number().int().min(0).optional(),
});
export type CreateAssignmentGroupInput = z.infer<typeof createAssignmentGroupSchema>;

export const updateAssignmentGroupSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  weight: z.number().int().min(0).max(100).optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateAssignmentGroupInput = z.infer<typeof updateAssignmentGroupSchema>;

export const reorderAssignmentGroupsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderAssignmentGroupsInput = z.infer<typeof reorderAssignmentGroupsSchema>;

// ---------- Student groups ----------

export const groupSetNameSchema = z.string().trim().min(1).max(100);
export const groupNameSchema = z.string().trim().min(1).max(100);

export const createGroupSetSchema = z.object({
  name: groupSetNameSchema,
  maxMembersPerGroup: z.number().int().min(1).max(GROUP_SET_MAX_MEMBERS_PER_GROUP),
  numberOfGroups: z.number().int().min(1).max(GROUP_SET_MAX_GROUPS),
  signupMode: z.enum(GROUP_SET_SIGNUP_MODES).optional(),
});
export type CreateGroupSetInput = z.infer<typeof createGroupSetSchema>;

export const updateGroupSetSchema = z
  .object({
    name: groupSetNameSchema.optional(),
    maxMembersPerGroup: z
      .number()
      .int()
      .min(1)
      .max(GROUP_SET_MAX_MEMBERS_PER_GROUP)
      .optional(),
    signupMode: z.enum(GROUP_SET_SIGNUP_MODES).optional(),
    signupStatus: z.enum(GROUP_SET_SIGNUP_STATUSES).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'At least one field must be provided',
  });
export type UpdateGroupSetInput = z.infer<typeof updateGroupSetSchema>;

export const updateGroupSchema = z
  .object({
    name: groupNameSchema.optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'At least one field must be provided',
  });
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const assignGroupMemberSchema = z.object({
  studentId: z.string().uuid(),
});
export type AssignGroupMemberInput = z.infer<typeof assignGroupMemberSchema>;

