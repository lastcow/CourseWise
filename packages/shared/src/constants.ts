export const APP_NAME = 'CourseWise';

export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const USER_ROLES = ['admin', 'teacher', 'student'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const API_TOKEN_PREFIX = 'cmpt_';

export const API_TOKEN_SCOPES = [
  'admin:read',
  'admin:write',
  'admin:tokens',
  'teacher:read',
  'teacher:write',
  'teacher:grades',
  'student:read',
] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export const ADMIN_TOKEN_SCOPES: readonly ApiTokenScope[] = [
  'admin:read',
  'admin:write',
  'admin:tokens',
];

export const TEACHER_ALLOWED_SCOPES: readonly ApiTokenScope[] = [
  'teacher:read',
  'teacher:write',
  'teacher:grades',
];

export const API_ROUTES = {
  health: '/api/health',
  version: '/api/version',
  auth: {
    registerStudent: '/api/auth/register-student',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    me: '/api/auth/me',
    refresh: '/api/auth/refresh',
  },
  me: {
    preferences: '/api/me/preferences',
    apiTokens: '/api/me/api-tokens',
  },
  admin: {
    apiTokens: '/api/admin/api-tokens',
  },
  teacher: {
    apiTokens: '/api/teacher/api-tokens',
  },
} as const;
