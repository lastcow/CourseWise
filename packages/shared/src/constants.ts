export const APP_NAME = 'CourseWise';

export const SUPPORTED_LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const API_ROUTES = {
  health: '/health',
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    me: '/auth/me',
  },
} as const;
