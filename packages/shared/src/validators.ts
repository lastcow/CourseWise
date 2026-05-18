import { z } from 'zod';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  API_TOKEN_SCOPES,
  COURSE_STATUSES,
  FILE_RELATED_TYPES,
  MATERIAL_SOURCE_TYPES,
  MATERIAL_STATUSES,
  MAX_UPLOAD_BYTES,
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

export const gradingPolicySchema = z
  .object({
    attendance: z.number().int().min(0).max(100),
    assignments: z.number().int().min(0).max(100),
    quizzes: z.number().int().min(0).max(100),
    discussion: z.number().int().min(0).max(100),
    finalProject: z.number().int().min(0).max(100),
  })
  .refine(
    (v) => v.attendance + v.assignments + v.quizzes + v.discussion + v.finalProject === 100,
    { message: 'Grading policy weights must sum to 100', path: ['gradingPolicy'] },
  );
export type GradingPolicy = z.infer<typeof gradingPolicySchema>;

export const courseCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Course code may contain letters, digits, hyphens and underscores only');

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
  .regex(/^[A-Za-z0-9_-]+$/, 'Invitation code may contain letters, digits, hyphens and underscores');

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

const baseMaterialFields = {
  title: z.string().trim().min(1).max(200),
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

export const updateMaterialSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  type: z.string().trim().min(1).max(64).optional(),
  moduleId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional(),
  content: z.string().trim().max(100_000).optional().nullable(),
  externalUrl: z.string().trim().url().max(2048).optional().nullable(),
  fileAssetId: z.string().uuid().optional().nullable(),
  status: z.enum(MATERIAL_STATUSES).optional(),
});
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

export const uploadUrlRequestSchema = z.object({
  courseId: z.string().uuid(),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[^/\\?<>:"|*]+$/, 'Invalid file name'),
  mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  relatedType: z.enum(FILE_RELATED_TYPES).default('material'),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const completeUploadSchema = z.object({
  fileAssetId: z.string().uuid(),
});
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

// ---------- M3: Presentations ----------
export const createPresentationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  moduleId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional(),
});
export type CreatePresentationInput = z.infer<typeof createPresentationSchema>;

export const updatePresentationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  moduleId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional(),
});
export type UpdatePresentationInput = z.infer<typeof updatePresentationSchema>;

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
export const createAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20_000).optional().nullable(),
  moduleId: z.string().uuid().optional().nullable(),
  dueDate: isoDateString.optional().nullable(),
  maxScore: z.number().min(0).max(1000).optional().nullable(),
  rubric: z.unknown().optional(),
  allowLateSubmission: z.boolean().optional(),
  attachmentFileId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20_000).optional().nullable(),
  moduleId: z.string().uuid().optional().nullable(),
  dueDate: isoDateString.optional().nullable(),
  maxScore: z.number().min(0).max(1000).optional().nullable(),
  rubric: z.unknown().optional(),
  allowLateSubmission: z.boolean().optional(),
  attachmentFileId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional(),
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
