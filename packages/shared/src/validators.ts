import { z } from 'zod';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  API_TOKEN_SCOPES,
  COURSE_STATUSES,
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
  relatedType: z.string().trim().min(1).max(64).default('material'),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const completeUploadSchema = z.object({
  fileAssetId: z.string().uuid(),
});
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
