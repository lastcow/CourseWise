import { z } from 'zod';
import { API_TOKEN_SCOPES, SUPPORTED_LOCALES } from './constants';

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
