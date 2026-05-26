export const APP_NAME = 'CourseWise';

export const SUPPORTED_LOCALES = ['en', 'zh-CN', 'fr'] as const;
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
  'quizzes:read',
  'quizzes:write',
  'quiz_attempts:read',
  'quiz_attempts:write',
  'attendance:read',
  'attendance:write',
  'alerts:read',
  'alerts:write',
  'dashboards:read',
  'ai:read',
  'ai:write',
  'ai:generate',
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
  'quizzes:read',
  'quizzes:write',
  'quiz_attempts:read',
  'quiz_attempts:write',
  'attendance:read',
  'attendance:write',
  'alerts:read',
  'alerts:write',
  'dashboards:read',
  'ai:read',
  'ai:generate',
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
  'quizzes:read',
  'quiz_attempts:read',
  'quiz_attempts:write',
  'attendance:read',
  'alerts:read',
  'dashboards:read',
];

/**
 * Resource → scopes that grant that resource action. JWT callers always pass;
 * API token callers must hold at least one scope from the list.
 */
export const SCOPE_GROUPS = {
  coursesRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'courses:read',
    'courses:write',
  ],
  coursesWrite: ['admin:write', 'teacher:write', 'courses:write'],
  materialsRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'materials:read',
    'materials:write',
    'courses:read',
    'courses:write',
  ],
  materialsWrite: ['admin:write', 'teacher:write', 'materials:write', 'courses:write'],
  invitationCodesRead: [
    'admin:read',
    'admin:write',
    'invitation_codes:read',
    'invitation_codes:write',
  ],
  invitationCodesWrite: ['admin:write', 'invitation_codes:write'],
  presentationsRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'presentations:read',
    'presentations:write',
  ],
  presentationsWrite: ['admin:write', 'teacher:write', 'presentations:write'],
  assignmentsRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'assignments:read',
    'assignments:write',
  ],
  assignmentsWrite: ['admin:write', 'teacher:write', 'assignments:write'],
  submissionsRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'submissions:read',
    'submissions:write',
  ],
  submissionsWrite: ['admin:write', 'teacher:write', 'student:read', 'submissions:write'],
  discussionsRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'discussions:read',
    'discussions:write',
  ],
  discussionsWrite: ['admin:write', 'teacher:write', 'student:read', 'discussions:write'],
  gradesRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'teacher:grades',
    'grades:read',
    'grades:write',
  ],
  gradesWrite: [
    'admin:write',
    'teacher:write',
    'teacher:grades',
    'grades:write',
    'discussions:write',
  ],
  quizzesRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'quizzes:read',
    'quizzes:write',
  ],
  quizzesWrite: ['admin:write', 'teacher:write', 'quizzes:write'],
  quizAttemptsRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'quiz_attempts:read',
    'quiz_attempts:write',
    'quizzes:read',
    'quizzes:write',
  ],
  quizAttemptsWrite: ['admin:write', 'teacher:write', 'student:read', 'quiz_attempts:write'],
  quizGradeWrite: [
    'admin:write',
    'teacher:write',
    'teacher:grades',
    'quizzes:write',
    'grades:write',
  ],
  attendanceRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'attendance:read',
    'attendance:write',
  ],
  attendanceWrite: ['admin:write', 'teacher:write', 'attendance:write'],
  alertsRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'alerts:read',
    'alerts:write',
  ],
  alertsWrite: ['admin:write', 'teacher:write', 'alerts:write'],
  dashboardsRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'student:read',
    'dashboards:read',
  ],
  aiAdminRead: ['admin:read', 'admin:write', 'ai:read', 'ai:write'],
  aiAdminWrite: ['admin:write', 'ai:write'],
  aiJobsRead: [
    'admin:read',
    'admin:write',
    'teacher:read',
    'teacher:write',
    'ai:read',
    'ai:generate',
  ],
  aiJobsWrite: ['admin:write', 'teacher:write', 'ai:generate'],
} as const satisfies Record<string, readonly ApiTokenScope[]>;
export type ScopeGroupName = keyof typeof SCOPE_GROUPS;

// Curated allowlist of upstream model IDs per provider that admins can pick
// from in the AI configuration UI. Bumping this list does not require a
// schema migration; it just widens what an admin may choose to enable.
// Adjust as new models ship.
export const AI_MODEL_CATALOG = {
  anthropic: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
    { id: 'o3', label: 'o3' },
    { id: 'o3-mini', label: 'o3-mini' },
    { id: 'o4-mini', label: 'o4-mini' },
  ],
} as const satisfies Record<'anthropic' | 'openai', readonly { id: string; label: string }[]>;

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
} as const;

export const DEFAULT_ASSIGNMENT_GROUPS = [
  { name: 'Assignments', weight: 35, position: 0 },
  { name: 'Quizzes', weight: 30, position: 1 },
  { name: 'Discussion', weight: 10, position: 2 },
  { name: 'Final Project', weight: 15, position: 3 },
] as const;

export interface LetterGradeThreshold {
  letter: string;
  minScore: number;
}

export const DEFAULT_LETTER_GRADES: readonly LetterGradeThreshold[] = [
  { letter: 'A', minScore: 90 },
  { letter: 'B', minScore: 80 },
  { letter: 'C', minScore: 70 },
  { letter: 'D', minScore: 60 },
  { letter: 'F', minScore: 0 },
];

export const ALERT_TYPES = [
  'attendance_low',
  'consecutive_absences',
  'late_submissions',
  'quiz_average_low',
  'inactivity',
  'manual',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_RISK_TYPES: readonly AlertType[] = [
  'attendance_low',
  'consecutive_absences',
  'late_submissions',
  'quiz_average_low',
  'inactivity',
];

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ALERT_RULES = {
  attendance_low: { threshold: 0.7, severity: 'warning' as AlertSeverity },
  consecutive_absences: { threshold: 2, severity: 'warning' as AlertSeverity },
  late_submissions: { threshold: 2, severity: 'warning' as AlertSeverity },
  quiz_average_low: { threshold: 60, severity: 'warning' as AlertSeverity },
  inactivity: { days: 7, severity: 'info' as AlertSeverity },
} as const;

export const MATERIAL_RELATED_TYPE = 'material';

export const FILE_RELATED_TYPES = ['material', 'assignment', 'submission', 'course', 'presentation'] as const;
export type FileRelatedType = (typeof FILE_RELATED_TYPES)[number];

export const PRESENTATION_STATUSES = ['draft', 'published', 'archived'] as const;
export type PresentationStatus = (typeof PRESENTATION_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ['draft', 'published', 'closed', 'archived'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const SUBMISSION_STATUSES = ['draft', 'submitted', 'late', 'graded', 'returned'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const DISCUSSION_TOPIC_STATUSES = ['draft', 'published', 'archived'] as const;
export type DiscussionTopicStatus = (typeof DISCUSSION_TOPIC_STATUSES)[number];

export const QUIZ_STATUSES = ['draft', 'published', 'closed', 'archived'] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

export const QUIZ_QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
  'case_analysis',
] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

export const QUIZ_AUTO_GRADED_TYPES: readonly QuizQuestionType[] = [
  'single_choice',
  'multiple_choice',
  'true_false',
];

export const QUIZ_ATTEMPT_STATUSES = ['in_progress', 'submitted', 'expired'] as const;
export type QuizAttemptStatus = (typeof QUIZ_ATTEMPT_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_SESSION_STATUSES = ['open', 'closed'] as const;
export type AttendanceSessionStatus = (typeof ATTENDANCE_SESSION_STATUSES)[number];

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
    registerTeacher: '/api/auth/register-teacher',
    teacherInvitations: '/api/auth/teacher-invitations',
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
    teacherInvitations: '/api/admin/teacher-invitations',
    teachers: '/api/admin/teachers',
    aiProviders: '/api/admin/ai/providers',
    aiModels: '/api/admin/ai/models',
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
  quizzes: '/api/quizzes',
  quizQuestions: '/api/quiz-questions',
  quizAttempts: '/api/quiz-attempts',
  quizAnswers: '/api/quiz-answers',
  attendanceSessions: '/api/attendance-sessions',
  gradingPolicies: '/api/grading-policies',
  finalGrades: '/api/final-grades',
  alerts: '/api/alerts',
  dashboards: '/api/dashboards',
} as const;

// ---------- Presentation providers ----------
// Today only Gamma renders externally; everything else is in-app slides.
export const PRESENTATION_PROVIDERS = ['gamma'] as const;
export type PresentationProvider = (typeof PRESENTATION_PROVIDERS)[number];

// ---------- Gamma Generate API (gamma.app) ----------
export const GAMMA_IMAGE_SOURCES = [
  'aiGenerated',
  'webFreeToUse',
  'webFreeToUseCommercially',
  'pictographic',
  'themeAccent',
  'noImages',
] as const;
export type GammaImageSource = (typeof GAMMA_IMAGE_SOURCES)[number];

export const GAMMA_TEXT_AMOUNTS = ['brief', 'medium', 'detailed', 'extensive'] as const;
export type GammaTextAmount = (typeof GAMMA_TEXT_AMOUNTS)[number];

// Top-level Gamma field controlling how the inputText is transformed. Required
// by Gamma's public API (validation: must be 'generate' | 'condense' | 'preserve').
//   generate  — write new content from a short prompt
//   condense  — summarise/shorten long source material (our default — feeds
//               reading-material content into a slide deck)
//   preserve  — keep wording mostly verbatim, just restructure for slides
export const GAMMA_TEXT_MODES = ['generate', 'condense', 'preserve'] as const;
export type GammaTextMode = (typeof GAMMA_TEXT_MODES)[number];

// Bounds for `numCards` (Gamma slang for slide count). Gamma accepts higher
// values on some plans; we cap at 60 to keep the UI sensible and credit usage
// predictable. Gamma will decide the count when this is omitted.
export const GAMMA_MIN_NUM_CARDS = 1;
export const GAMMA_MAX_NUM_CARDS = 60;

export const GAMMA_JOB_STATUSES = ['pending', 'completed', 'failed'] as const;
export type GammaJobStatus = (typeof GAMMA_JOB_STATUSES)[number];

export const R2_CLEANUP_JOB_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type R2CleanupJobStatus = (typeof R2_CLEANUP_JOB_STATUSES)[number];

export const GAMMA_EXPORT_FORMATS = ['pptx', 'pdf'] as const;
export type GammaExportFormat = (typeof GAMMA_EXPORT_FORMATS)[number];

// Gamma's top-level `format` field — what artifact to produce. Default is
// `presentation`; the other three render different layouts (long-form doc,
// social-post graphic, single-page website).
// See https://developers.gamma.app/guides/generate-api-parameters-explained
export const GAMMA_FORMATS = ['presentation', 'document', 'social', 'webpage'] as const;
export type GammaFormat = (typeof GAMMA_FORMATS)[number];
export const DEFAULT_GAMMA_FORMAT: GammaFormat = 'presentation';

// Themes pinned into the dropdown even when not returned by GET /v1.0/themes.
// Currently empty — see git history for prior entries (e.g. Pearl) and the
// reasoning around hardcoded fallbacks.
export const GAMMA_BUILTIN_THEMES: ReadonlyArray<{
  id: string;
  name: string;
  previewUrl: null;
}> = [];

// Curated image-style options for the dialog. Gamma's `imageOptions.style` is
// free-form text — `value` is the literal string sent to Gamma; `slug` is the
// i18n key suffix (must be a valid JS identifier). Empty value = let Gamma
// decide.
export const GAMMA_IMAGE_STYLES = [
  { slug: 'auto', value: '' },
  { slug: 'photorealistic', value: 'photorealistic' },
  { slug: 'illustrated', value: 'illustrated' },
  { slug: 'watercolor', value: 'watercolor' },
  { slug: 'lineArt', value: 'minimal, line art' },
  { slug: 'rendered3d', value: '3d rendered' },
  { slug: 'cinematic', value: 'cinematic' },
  { slug: 'vintage', value: 'vintage' },
] as const;
export type GammaImageStyleSlug = (typeof GAMMA_IMAGE_STYLES)[number]['slug'];

// Soft caps; mirror Gamma's hard limits but lower so we keep headroom.
export const GAMMA_MAX_INPUT_TEXT_CHARS = 380_000; // Gamma's hard cap is 400_000.
export const GAMMA_MAX_INSTRUCTIONS_CHARS = 5_000;
export const GAMMA_MAX_IMAGE_STYLE_CHARS = 500;

// FERPA §99.20 — record-correction requests submitted by students.
export const RECORD_CORRECTION_TARGETS = [
  'final_grade',
  'attendance',
  'submission',
  'discussion',
  'profile',
  'other',
] as const;
export type RecordCorrectionTarget = (typeof RECORD_CORRECTION_TARGETS)[number];

export const RECORD_CORRECTION_STATUSES = [
  'open',
  'accepted',
  'declined',
  'withdrawn',
] as const;
export type RecordCorrectionStatus = (typeof RECORD_CORRECTION_STATUSES)[number];

// ---------- Student groups (Canvas-style group sets) ----------
export const GROUP_SET_SIGNUP_MODES = ['self_signup', 'teacher_assigned', 'mixed'] as const;
export type GroupSetSignupMode = (typeof GROUP_SET_SIGNUP_MODES)[number];

export const GROUP_SET_SIGNUP_STATUSES = ['open', 'locked'] as const;
export type GroupSetSignupStatus = (typeof GROUP_SET_SIGNUP_STATUSES)[number];

export const GROUP_SET_MAX_GROUPS = 100;
export const GROUP_SET_MAX_MEMBERS_PER_GROUP = 100;
