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
  'courses:read',
  'courses:write',
  'materials:read',
  'materials:write',
  'invitation_codes:read',
  'invitation_codes:write',
  'presentations:read',
  'presentations:write',
  'assignments:read',
  'assignments:write',
  'submissions:read',
  'submissions:write',
  'discussions:read',
  'discussions:write',
  'grades:read',
  'grades:write',
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
  'courses:read',
  'courses:write',
  'materials:read',
  'materials:write',
  'invitation_codes:read',
  'presentations:read',
  'presentations:write',
  'assignments:read',
  'assignments:write',
  'submissions:read',
  'submissions:write',
  'discussions:read',
  'discussions:write',
  'grades:read',
  'grades:write',
];

export const STUDENT_ALLOWED_SCOPES: readonly ApiTokenScope[] = [
  'student:read',
  'courses:read',
  'materials:read',
  'presentations:read',
  'assignments:read',
  'submissions:read',
  'submissions:write',
  'discussions:read',
  'discussions:write',
];

/**
 * Resource → scopes that grant that resource action. JWT callers always pass;
 * API token callers must hold at least one scope from the list.
 */
export const SCOPE_GROUPS = {
  coursesRead: ['admin:read', 'admin:write', 'teacher:read', 'teacher:write', 'courses:read', 'courses:write'],
  coursesWrite: ['admin:write', 'teacher:write', 'courses:write'],
  materialsRead: ['admin:read', 'admin:write', 'teacher:read', 'teacher:write', 'student:read', 'materials:read', 'materials:write', 'courses:read', 'courses:write'],
  materialsWrite: ['admin:write', 'teacher:write', 'materials:write', 'courses:write'],
  invitationCodesRead: ['admin:read', 'admin:write', 'invitation_codes:read', 'invitation_codes:write'],
  invitationCodesWrite: ['admin:write', 'invitation_codes:write'],
  presentationsRead: ['admin:read', 'admin:write', 'teacher:read', 'teacher:write', 'student:read', 'presentations:read', 'presentations:write'],
  presentationsWrite: ['admin:write', 'teacher:write', 'presentations:write'],
  assignmentsRead: ['admin:read', 'admin:write', 'teacher:read', 'teacher:write', 'student:read', 'assignments:read', 'assignments:write'],
  assignmentsWrite: ['admin:write', 'teacher:write', 'assignments:write'],
  submissionsRead: ['admin:read', 'admin:write', 'teacher:read', 'teacher:write', 'student:read', 'submissions:read', 'submissions:write'],
  submissionsWrite: ['admin:write', 'teacher:write', 'student:read', 'submissions:write'],
  discussionsRead: ['admin:read', 'admin:write', 'teacher:read', 'teacher:write', 'student:read', 'discussions:read', 'discussions:write'],
  discussionsWrite: ['admin:write', 'teacher:write', 'student:read', 'discussions:write'],
  gradesRead: ['admin:read', 'admin:write', 'teacher:read', 'teacher:write', 'teacher:grades', 'grades:read', 'grades:write'],
  gradesWrite: ['admin:write', 'teacher:write', 'teacher:grades', 'grades:write', 'discussions:write'],
} as const satisfies Record<string, readonly ApiTokenScope[]>;
export type ScopeGroupName = keyof typeof SCOPE_GROUPS;

export const COURSE_STATUSES = ['draft', 'active', 'archived'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const MATERIAL_STATUSES = ['draft', 'published', 'archived'] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const MATERIAL_SOURCE_TYPES = ['upload', 'external_link', 'manual_text'] as const;
export type MaterialSourceType = (typeof MATERIAL_SOURCE_TYPES)[number];

export const FILE_ASSET_STATUSES = ['pending', 'ready', 'deleted'] as const;
export type FileAssetStatus = (typeof FILE_ASSET_STATUSES)[number];

export const INVITATION_STATUSES = ['active', 'revoked', 'expired'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const DEFAULT_GRADING_POLICY = {
  attendance: 10,
  assignments: 35,
  quizzes: 30,
  discussion: 10,
  finalProject: 15,
} as const;

export const MATERIAL_RELATED_TYPE = 'material';

export const FILE_RELATED_TYPES = ['material', 'assignment', 'submission'] as const;
export type FileRelatedType = (typeof FILE_RELATED_TYPES)[number];

export const PRESENTATION_STATUSES = ['draft', 'published', 'archived'] as const;
export type PresentationStatus = (typeof PRESENTATION_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ['draft', 'published', 'closed', 'archived'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const SUBMISSION_STATUSES = ['draft', 'submitted', 'late', 'graded', 'returned'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const DISCUSSION_TOPIC_STATUSES = ['draft', 'published', 'archived'] as const;
export type DiscussionTopicStatus = (typeof DISCUSSION_TOPIC_STATUSES)[number];

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'text/plain',
  'text/markdown',
] as const;
export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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
  courses: '/api/courses',
  modules: '/api/modules',
  materials: '/api/materials',
  invitationCodes: '/api/invitation-codes',
  files: '/api/files',
  presentations: '/api/presentations',
  slides: '/api/slides',
  assignments: '/api/assignments',
  submissions: '/api/submissions',
  discussionTopics: '/api/discussion-topics',
  discussionPosts: '/api/discussion-posts',
} as const;
