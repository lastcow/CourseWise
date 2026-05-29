import {
  API_TOKEN_SCOPES,
  SCOPE_GROUPS,
  USER_ROLES,
  type ScopeGroupName,
} from '@coursewise/shared';
import { ERROR_CODES } from './errors';

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

type SecurityKind = 'public' | 'jwt' | 'either';

/**
 * The only routes that may serve unauthenticated traffic. Every other route
 * MUST be mounted behind `requireAuth` / `requireJwtAuth`. The
 * `auth-coverage` test in `index.test.ts` walks Hono's route table and
 * enforces this invariant.
 *
 * Whitelisted endpoints are also rendered with `security: []` in the OpenAPI
 * spec (no auth challenge).
 */
export const PUBLIC_ROUTE_WHITELIST: ReadonlyArray<{ method: Method; path: string }> = [
  { method: 'get', path: '/api/health' },
  { method: 'get', path: '/api/version' },
  { method: 'get', path: '/api/openapi.json' },
  { method: 'post', path: '/api/auth/login' },
  { method: 'post', path: '/api/auth/refresh' },
  { method: 'post', path: '/api/auth/register-student' },
  { method: 'post', path: '/api/auth/register-teacher' },
  { method: 'post', path: '/api/auth/forgot-password' },
  { method: 'post', path: '/api/auth/reset-password' },
  { method: 'get', path: '/api/auth/teacher-invitations/:token' },
];

export function isPublicRoute(method: string, path: string): boolean {
  const m = method.toLowerCase() as Method;
  return PUBLIC_ROUTE_WHITELIST.some((entry) => entry.method === m && entry.path === path);
}

interface RouteSpec {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  security: SecurityKind;
  scopeGroup?: ScopeGroupName;
  roles?: readonly (typeof USER_ROLES)[number][];
  pathParams?: string[];
  queryParams?: { name: string; description?: string; required?: boolean }[];
  requestSchema?: string;
  responseSchema?: string;
}

const r = (
  method: Method,
  path: string,
  summary: string,
  tag: string,
  opts: Partial<Omit<RouteSpec, 'method' | 'path' | 'summary' | 'tag'>> & {
    security?: SecurityKind;
  } = {},
): RouteSpec => ({
  method,
  path,
  summary,
  tag,
  security: opts.security ?? 'either',
  ...opts,
});

const idParams = (...names: string[]) => names;

export const ROUTES: readonly RouteSpec[] = [
  // ---------- Discovery ----------
  r('get', '/api/health', 'Service liveness probe', 'meta', {
    security: 'public',
    responseSchema: 'HealthResponse',
  }),
  r('get', '/api/version', 'API version and build info', 'meta', {
    security: 'public',
    responseSchema: 'VersionResponse',
  }),
  r('get', '/api/openapi.json', 'OpenAPI 3.1 specification for this API', 'meta', {
    security: 'public',
  }),

  // ---------- Auth ----------
  r('post', '/api/auth/register-student', 'Register a student with an invitation code', 'auth', {
    security: 'public',
    requestSchema: 'RegisterInput',
    responseSchema: 'AuthLoginResponse',
  }),
  r('post', '/api/auth/login', 'Email + password login (JWT pair)', 'auth', {
    security: 'public',
    requestSchema: 'LoginInput',
    responseSchema: 'AuthLoginResponse',
  }),
  r('post', '/api/auth/refresh', 'Rotate the access + refresh token pair', 'auth', {
    security: 'public',
    requestSchema: 'RefreshInput',
    responseSchema: 'AuthLoginResponse',
  }),
  r('post', '/api/auth/logout', 'Revoke the supplied refresh token', 'auth', {
    security: 'either',
    requestSchema: 'RefreshInput',
  }),
  r('get', '/api/auth/me', 'Current authenticated user (JWT only)', 'auth', {
    security: 'jwt',
    responseSchema: 'UserSelf',
  }),
  r(
    'get',
    '/api/auth/teacher-invitations/{token}',
    'Look up a teacher invitation by token (public)',
    'auth',
    {
      security: 'public',
      pathParams: ['token'],
    },
  ),
  r('post', '/api/auth/register-teacher', 'Register a teacher with an invitation token', 'auth', {
    security: 'public',
    requestSchema: 'RegisterTeacherInput',
    responseSchema: 'AuthLoginResponse',
  }),
  r('post', '/api/auth/forgot-password', 'Request a password-reset link by email', 'auth', {
    security: 'public',
    requestSchema: 'ForgotPasswordInput',
  }),
  r('post', '/api/auth/reset-password', 'Reset a password using a reset token', 'auth', {
    security: 'public',
    requestSchema: 'ResetPasswordInput',
  }),

  // ---------- Me / preferences / tokens ----------
  r('get', '/api/me/preferences', 'Get my preferences', 'me', { security: 'jwt' }),
  r('patch', '/api/me/preferences', 'Update my preferences', 'me', {
    security: 'jwt',
    requestSchema: 'UpdatePreferencesInput',
  }),
  r('get', '/api/me/api-tokens', 'List my API tokens (no plaintext)', 'me', { security: 'jwt' }),
  r(
    'post',
    '/api/me/api-tokens',
    'Create a self-service API token (returns plaintext once; scope auto-bound to caller role)',
    'me',
    {
      security: 'jwt',
      requestSchema: 'CreateSelfApiTokenInput',
      responseSchema: 'ApiTokenCreated',
    },
  ),
  r('post', '/api/me/api-tokens/{id}/revoke', 'Revoke one of my API tokens', 'me', {
    security: 'jwt',
    pathParams: idParams('id'),
  }),

  // ---------- Admin / API tokens ----------
  r('get', '/api/admin/api-tokens', 'List all API tokens in the workspace', 'admin', {
    security: 'jwt',
    roles: ['admin'],
  }),
  r(
    'post',
    '/api/admin/api-tokens',
    'Mint an admin API token (any scope, returns plaintext once)',
    'admin',
    {
      security: 'jwt',
      roles: ['admin'],
      requestSchema: 'CreateApiTokenInput',
      responseSchema: 'ApiTokenCreated',
    },
  ),
  r('post', '/api/admin/api-tokens/{id}/revoke', 'Admin: revoke any API token', 'admin', {
    security: 'jwt',
    roles: ['admin'],
    pathParams: idParams('id'),
  }),
  r('get', '/api/admin/users/{userId}/api-tokens', "Admin: list a user's tokens", 'admin', {
    security: 'jwt',
    roles: ['admin'],
    pathParams: idParams('userId'),
  }),

  // ---------- Admin / Teachers + Invitations ----------
  r('get', '/api/admin/teachers', 'List active teachers (with course counts)', 'admin', {
    security: 'jwt',
    roles: ['admin'],
  }),
  r('get', '/api/admin/teacher-invitations', 'List teacher invitations', 'admin', {
    security: 'jwt',
    roles: ['admin'],
    queryParams: [
      { name: 'status', description: 'pending | accepted | revoked | expired' },
      { name: 'page' },
      { name: 'pageSize' },
    ],
  }),
  r('post', '/api/admin/teacher-invitations', 'Create a teacher invitation', 'admin', {
    security: 'jwt',
    roles: ['admin'],
    requestSchema: 'CreateTeacherInvitationInput',
  }),
  r('post', '/api/admin/teacher-invitations/{id}/revoke', 'Revoke a teacher invitation', 'admin', {
    security: 'jwt',
    roles: ['admin'],
    pathParams: idParams('id'),
  }),
  r(
    'post',
    '/api/admin/teacher-invitations/{id}/resend',
    'Resend / rotate a teacher invitation',
    'admin',
    {
      security: 'jwt',
      roles: ['admin'],
      pathParams: idParams('id'),
    },
  ),

  // ---------- Teacher / API tokens ----------
  r('get', '/api/teacher/api-tokens', 'List my teacher API tokens', 'teacher', {
    security: 'jwt',
    roles: ['teacher'],
  }),
  r(
    'post',
    '/api/teacher/api-tokens',
    'Mint a teacher API token (non-admin scopes only)',
    'teacher',
    {
      security: 'jwt',
      roles: ['teacher'],
      requestSchema: 'CreateApiTokenInput',
      responseSchema: 'ApiTokenCreated',
    },
  ),
  r('post', '/api/teacher/api-tokens/{id}/revoke', 'Teacher: revoke my token', 'teacher', {
    security: 'jwt',
    roles: ['teacher'],
    pathParams: idParams('id'),
  }),

  // ---------- Invitations ----------
  r(
    'post',
    '/api/invitation-codes/validate',
    'Validate an invitation code (authenticated, rate-limited)',
    'invitations',
    {
      security: 'either',
      requestSchema: 'ValidateInvitationInput',
    },
  ),
  r('get', '/api/invitation-codes', 'List invitation codes', 'invitations', {
    scopeGroup: 'invitationCodesRead',
    roles: ['admin'],
  }),
  r('get', '/api/invitation-codes/{id}', 'Get an invitation code', 'invitations', {
    scopeGroup: 'invitationCodesRead',
    roles: ['admin'],
    pathParams: idParams('id'),
  }),
  r('post', '/api/invitation-codes', 'Create an invitation code', 'invitations', {
    scopeGroup: 'invitationCodesWrite',
    roles: ['admin'],
  }),
  r('patch', '/api/invitation-codes/{id}', 'Update an invitation code', 'invitations', {
    scopeGroup: 'invitationCodesWrite',
    roles: ['admin'],
    pathParams: idParams('id'),
  }),
  r(
    'post',
    '/api/invitation-codes/{id}/deactivate',
    'Deactivate an invitation code',
    'invitations',
    { scopeGroup: 'invitationCodesWrite', roles: ['admin'], pathParams: idParams('id') },
  ),

  // ---------- Courses ----------
  r('get', '/api/courses', 'List courses (scoped to caller)', 'courses', {
    scopeGroup: 'coursesRead',
  }),
  r('post', '/api/courses', 'Create a course', 'courses', { scopeGroup: 'coursesWrite' }),
  r('get', '/api/courses/{courseId}', 'Get a course', 'courses', {
    scopeGroup: 'coursesRead',
    pathParams: idParams('courseId'),
  }),
  r('patch', '/api/courses/{courseId}', 'Update a course', 'courses', {
    scopeGroup: 'coursesWrite',
    pathParams: idParams('courseId'),
  }),
  r('delete', '/api/courses/{courseId}', 'Delete a course', 'courses', {
    scopeGroup: 'coursesWrite',
    pathParams: idParams('courseId'),
  }),
  r('post', '/api/courses/{courseId}/archive', 'Archive a course', 'courses', {
    scopeGroup: 'coursesWrite',
    pathParams: idParams('courseId'),
  }),
  r('post', '/api/courses/{courseId}/activate', 'Activate (publish) a course', 'courses', {
    scopeGroup: 'coursesWrite',
    pathParams: idParams('courseId'),
  }),
  r('get', '/api/courses/{courseId}/students', 'List enrolled students', 'courses', {
    scopeGroup: 'coursesRead',
    pathParams: idParams('courseId'),
  }),
  r(
    'post',
    '/api/courses/{courseId}/enrollments',
    'Enroll a student in a course (admin)',
    'courses',
    { scopeGroup: 'coursesWrite', roles: ['admin'], pathParams: idParams('courseId') },
  ),
  r('delete', '/api/courses/{courseId}/enrollments/{studentId}', 'Unenroll a student', 'courses', {
    scopeGroup: 'coursesWrite',
    roles: ['admin'],
    pathParams: idParams('courseId', 'studentId'),
  }),

  // ---------- Modules ----------
  r('get', '/api/courses/{courseId}/modules', 'List modules for a course', 'modules', {
    scopeGroup: 'coursesRead',
    pathParams: idParams('courseId'),
  }),
  r('post', '/api/courses/{courseId}/modules', 'Create a module', 'modules', {
    scopeGroup: 'coursesWrite',
    pathParams: idParams('courseId'),
  }),
  r('post', '/api/courses/{courseId}/modules/reorder', 'Reorder modules', 'modules', {
    scopeGroup: 'coursesWrite',
    pathParams: idParams('courseId'),
  }),
  r('get', '/api/modules/{moduleId}', 'Get a module', 'modules', {
    scopeGroup: 'coursesRead',
    pathParams: idParams('moduleId'),
  }),
  r('patch', '/api/modules/{moduleId}', 'Update a module', 'modules', {
    scopeGroup: 'coursesWrite',
    pathParams: idParams('moduleId'),
  }),
  r('delete', '/api/modules/{moduleId}', 'Delete a module', 'modules', {
    scopeGroup: 'coursesWrite',
    pathParams: idParams('moduleId'),
  }),

  // ---------- Materials ----------
  r(
    'get',
    '/api/courses/{courseId}/materials',
    'List reading materials for a course',
    'materials',
    { scopeGroup: 'materialsRead', pathParams: idParams('courseId') },
  ),
  r('post', '/api/courses/{courseId}/materials', 'Create a reading material', 'materials', {
    scopeGroup: 'materialsWrite',
    pathParams: idParams('courseId'),
  }),
  r('get', '/api/materials/{materialId}', 'Get a reading material', 'materials', {
    scopeGroup: 'materialsRead',
    pathParams: idParams('materialId'),
  }),
  r('patch', '/api/materials/{materialId}', 'Update a reading material', 'materials', {
    scopeGroup: 'materialsWrite',
    pathParams: idParams('materialId'),
  }),
  r('delete', '/api/materials/{materialId}', 'Delete a reading material', 'materials', {
    scopeGroup: 'materialsWrite',
    pathParams: idParams('materialId'),
  }),
  r('post', '/api/materials/{materialId}/publish', 'Publish a reading material', 'materials', {
    scopeGroup: 'materialsWrite',
    pathParams: idParams('materialId'),
  }),
  r('post', '/api/materials/{materialId}/archive', 'Archive a reading material', 'materials', {
    scopeGroup: 'materialsWrite',
    pathParams: idParams('materialId'),
  }),

  // ---------- Files (R2) ----------
  r(
    'post',
    '/api/files/upload',
    'Upload a file directly (multipart/form-data) — the Worker streams it to R2 and registers the asset in a single call',
    'files',
    { scopeGroup: 'materialsWrite' },
  ),
  r('get', '/api/files/{fileId}/download-url', 'Get a 5-min presigned download URL', 'files', {
    scopeGroup: 'materialsRead',
    pathParams: idParams('fileId'),
  }),
  r('delete', '/api/files/{fileId}', 'Delete a file asset', 'files', {
    scopeGroup: 'materialsWrite',
    pathParams: idParams('fileId'),
  }),

  // ---------- Presentations & slides ----------
  r('get', '/api/courses/{courseId}/presentations', 'List presentations', 'presentations', {
    scopeGroup: 'presentationsRead',
    pathParams: idParams('courseId'),
  }),
  r('post', '/api/courses/{courseId}/presentations', 'Create a presentation', 'presentations', {
    scopeGroup: 'presentationsWrite',
    pathParams: idParams('courseId'),
  }),
  r('get', '/api/presentations/{presentationId}', 'Get a presentation', 'presentations', {
    scopeGroup: 'presentationsRead',
    pathParams: idParams('presentationId'),
  }),
  r('patch', '/api/presentations/{presentationId}', 'Update a presentation', 'presentations', {
    scopeGroup: 'presentationsWrite',
    pathParams: idParams('presentationId'),
  }),
  r('delete', '/api/presentations/{presentationId}', 'Delete a presentation', 'presentations', {
    scopeGroup: 'presentationsWrite',
    pathParams: idParams('presentationId'),
  }),
  r(
    'post',
    '/api/presentations/{presentationId}/publish',
    'Publish a presentation',
    'presentations',
    { scopeGroup: 'presentationsWrite', pathParams: idParams('presentationId') },
  ),
  r(
    'post',
    '/api/presentations/{presentationId}/archive',
    'Archive a presentation',
    'presentations',
    { scopeGroup: 'presentationsWrite', pathParams: idParams('presentationId') },
  ),
  r(
    'get',
    '/api/presentations/{presentationId}/slides',
    'List slides for a presentation',
    'presentations',
    { scopeGroup: 'presentationsRead', pathParams: idParams('presentationId') },
  ),
  r('post', '/api/presentations/{presentationId}/slides', 'Add a slide', 'presentations', {
    scopeGroup: 'presentationsWrite',
    pathParams: idParams('presentationId'),
  }),
  r(
    'post',
    '/api/presentations/{presentationId}/slides/reorder',
    'Reorder slides',
    'presentations',
    { scopeGroup: 'presentationsWrite', pathParams: idParams('presentationId') },
  ),
  r('get', '/api/slides/{slideId}', 'Get a slide', 'presentations', {
    scopeGroup: 'presentationsRead',
    pathParams: idParams('slideId'),
  }),
  r('patch', '/api/slides/{slideId}', 'Update a slide', 'presentations', {
    scopeGroup: 'presentationsWrite',
    pathParams: idParams('slideId'),
  }),
  r('delete', '/api/slides/{slideId}', 'Delete a slide', 'presentations', {
    scopeGroup: 'presentationsWrite',
    pathParams: idParams('slideId'),
  }),

  // ---------- Gamma presentations ----------
  r('get', '/api/gamma/themes', 'List Gamma themes (1h KV-cached)', 'gamma', {
    scopeGroup: 'presentationsRead',
  }),
  r(
    'post',
    '/api/courses/{courseId}/presentations/gamma',
    'Start a Gamma generation from selected reading materials',
    'gamma',
    { scopeGroup: 'presentationsWrite', pathParams: idParams('courseId') },
  ),
  r('get', '/api/gamma-jobs/{jobId}', 'Poll the status of a Gamma generation job', 'gamma', {
    scopeGroup: 'presentationsWrite',
    pathParams: idParams('jobId'),
  }),

  // ---------- Assignments & submissions ----------
  r('get', '/api/courses/{courseId}/assignments', 'List assignments', 'assignments', {
    scopeGroup: 'assignmentsRead',
    pathParams: idParams('courseId'),
  }),
  r('post', '/api/courses/{courseId}/assignments', 'Create an assignment', 'assignments', {
    scopeGroup: 'assignmentsWrite',
    pathParams: idParams('courseId'),
  }),
  r('get', '/api/assignments/{assignmentId}', 'Get an assignment', 'assignments', {
    scopeGroup: 'assignmentsRead',
    pathParams: idParams('assignmentId'),
  }),
  r('patch', '/api/assignments/{assignmentId}', 'Update an assignment', 'assignments', {
    scopeGroup: 'assignmentsWrite',
    pathParams: idParams('assignmentId'),
  }),
  r('delete', '/api/assignments/{assignmentId}', 'Delete an assignment', 'assignments', {
    scopeGroup: 'assignmentsWrite',
    pathParams: idParams('assignmentId'),
  }),
  r('post', '/api/assignments/{assignmentId}/publish', 'Publish an assignment', 'assignments', {
    scopeGroup: 'assignmentsWrite',
    pathParams: idParams('assignmentId'),
  }),
  r('post', '/api/assignments/{assignmentId}/close', 'Close an assignment', 'assignments', {
    scopeGroup: 'assignmentsWrite',
    pathParams: idParams('assignmentId'),
  }),
  r('post', '/api/assignments/{assignmentId}/archive', 'Archive an assignment', 'assignments', {
    scopeGroup: 'assignmentsWrite',
    pathParams: idParams('assignmentId'),
  }),
  r(
    'get',
    '/api/assignments/{assignmentId}/submissions',
    'List submissions for an assignment',
    'assignments',
    { scopeGroup: 'submissionsRead', pathParams: idParams('assignmentId') },
  ),
  r('post', '/api/assignments/{assignmentId}/submissions', 'Student: submit work', 'assignments', {
    scopeGroup: 'submissionsWrite',
    pathParams: idParams('assignmentId'),
  }),
  r('get', '/api/submissions/{submissionId}', 'Get a submission', 'assignments', {
    scopeGroup: 'submissionsRead',
    pathParams: idParams('submissionId'),
  }),
  r('patch', '/api/submissions/{submissionId}', 'Update a draft submission', 'assignments', {
    scopeGroup: 'submissionsWrite',
    pathParams: idParams('submissionId'),
  }),
  r(
    'post',
    '/api/submissions/{submissionId}/submit',
    'Mark a submission as submitted',
    'assignments',
    { scopeGroup: 'submissionsWrite', pathParams: idParams('submissionId') },
  ),
  r(
    'post',
    '/api/submissions/{submissionId}/unsubmit',
    'Student: revert a submitted, ungraded submission to draft (while the window is open)',
    'assignments',
    { scopeGroup: 'submissionsWrite', pathParams: idParams('submissionId') },
  ),
  r('post', '/api/submissions/{submissionId}/grade', 'Teacher: grade a submission', 'assignments', {
    scopeGroup: 'gradesWrite',
    pathParams: idParams('submissionId'),
  }),
  r(
    'patch',
    '/api/submissions/{submissionId}/return',
    'Teacher: return a graded submission',
    'assignments',
    { scopeGroup: 'gradesWrite', pathParams: idParams('submissionId') },
  ),

  // ---------- Discussions ----------
  r('get', '/api/courses/{courseId}/discussion-topics', 'List discussion topics', 'discussions', {
    scopeGroup: 'discussionsRead',
    pathParams: idParams('courseId'),
  }),
  r(
    'post',
    '/api/courses/{courseId}/discussion-topics',
    'Create a discussion topic',
    'discussions',
    { scopeGroup: 'discussionsWrite', pathParams: idParams('courseId') },
  ),
  r('get', '/api/discussion-topics/{topicId}', 'Get a discussion topic', 'discussions', {
    scopeGroup: 'discussionsRead',
    pathParams: idParams('topicId'),
  }),
  r('patch', '/api/discussion-topics/{topicId}', 'Update a discussion topic', 'discussions', {
    scopeGroup: 'discussionsWrite',
    pathParams: idParams('topicId'),
  }),
  r('delete', '/api/discussion-topics/{topicId}', 'Delete a discussion topic', 'discussions', {
    scopeGroup: 'discussionsWrite',
    pathParams: idParams('topicId'),
  }),
  r(
    'post',
    '/api/discussion-topics/{topicId}/publish',
    'Publish a discussion topic',
    'discussions',
    { scopeGroup: 'discussionsWrite', pathParams: idParams('topicId') },
  ),
  r(
    'post',
    '/api/discussion-topics/{topicId}/archive',
    'Archive a discussion topic',
    'discussions',
    { scopeGroup: 'discussionsWrite', pathParams: idParams('topicId') },
  ),
  r('post', '/api/discussion-topics/{topicId}/pin', 'Pin a discussion topic', 'discussions', {
    scopeGroup: 'discussionsWrite',
    pathParams: idParams('topicId'),
  }),
  r('post', '/api/discussion-topics/{topicId}/unpin', 'Unpin a discussion topic', 'discussions', {
    scopeGroup: 'discussionsWrite',
    pathParams: idParams('topicId'),
  }),
  r('get', '/api/discussion-topics/{topicId}/posts', 'List posts in a topic', 'discussions', {
    scopeGroup: 'discussionsRead',
    pathParams: idParams('topicId'),
  }),
  r(
    'post',
    '/api/discussion-topics/{topicId}/posts',
    'Create a post (with optional parentPostId)',
    'discussions',
    { scopeGroup: 'discussionsWrite', pathParams: idParams('topicId') },
  ),
  r('get', '/api/discussion-posts/{postId}', 'Get a discussion post', 'discussions', {
    scopeGroup: 'discussionsRead',
    pathParams: idParams('postId'),
  }),
  r('patch', '/api/discussion-posts/{postId}', 'Update a discussion post', 'discussions', {
    scopeGroup: 'discussionsWrite',
    pathParams: idParams('postId'),
  }),
  r('delete', '/api/discussion-posts/{postId}', 'Delete a discussion post', 'discussions', {
    scopeGroup: 'discussionsWrite',
    pathParams: idParams('postId'),
  }),
  r(
    'post',
    '/api/discussion-topics/{topicId}/grades',
    'Teacher: assign per-student discussion grade',
    'discussions',
    { scopeGroup: 'gradesWrite', pathParams: idParams('topicId') },
  ),
  r(
    'get',
    '/api/discussion-topics/{topicId}/grades',
    'List discussion grades for a topic',
    'discussions',
    { scopeGroup: 'gradesRead', pathParams: idParams('topicId') },
  ),
  r(
    'patch',
    '/api/discussion-topics/{topicId}/grades/{studentId}',
    'Update a discussion grade',
    'discussions',
    { scopeGroup: 'gradesWrite', pathParams: idParams('topicId', 'studentId') },
  ),

  // ---------- Quizzes ----------
  r('get', '/api/courses/{courseId}/quizzes', 'List quizzes', 'quizzes', {
    scopeGroup: 'quizzesRead',
    pathParams: idParams('courseId'),
  }),
  r('post', '/api/courses/{courseId}/quizzes', 'Create a quiz', 'quizzes', {
    scopeGroup: 'quizzesWrite',
    pathParams: idParams('courseId'),
  }),
  r('get', '/api/quizzes/{quizId}', 'Get a quiz', 'quizzes', {
    scopeGroup: 'quizzesRead',
    pathParams: idParams('quizId'),
  }),
  r('patch', '/api/quizzes/{quizId}', 'Update a quiz', 'quizzes', {
    scopeGroup: 'quizzesWrite',
    pathParams: idParams('quizId'),
  }),
  r('delete', '/api/quizzes/{quizId}', 'Delete a quiz', 'quizzes', {
    scopeGroup: 'quizzesWrite',
    pathParams: idParams('quizId'),
  }),
  r('post', '/api/quizzes/{quizId}/publish', 'Publish a quiz', 'quizzes', {
    scopeGroup: 'quizzesWrite',
    pathParams: idParams('quizId'),
  }),
  r('post', '/api/quizzes/{quizId}/close', 'Close a quiz', 'quizzes', {
    scopeGroup: 'quizzesWrite',
    pathParams: idParams('quizId'),
  }),
  r('post', '/api/quizzes/{quizId}/archive', 'Archive a quiz', 'quizzes', {
    scopeGroup: 'quizzesWrite',
    pathParams: idParams('quizId'),
  }),
  r('get', '/api/quizzes/{quizId}/questions', 'List questions', 'quizzes', {
    scopeGroup: 'quizzesRead',
    pathParams: idParams('quizId'),
  }),
  r('post', '/api/quizzes/{quizId}/questions', 'Add a quiz question', 'quizzes', {
    scopeGroup: 'quizzesWrite',
    pathParams: idParams('quizId'),
  }),
  r('get', '/api/quiz-questions/{questionId}', 'Get a quiz question', 'quizzes', {
    scopeGroup: 'quizzesRead',
    pathParams: idParams('questionId'),
  }),
  r('patch', '/api/quiz-questions/{questionId}', 'Update a quiz question', 'quizzes', {
    scopeGroup: 'quizzesWrite',
    pathParams: idParams('questionId'),
  }),
  r('delete', '/api/quiz-questions/{questionId}', 'Delete a quiz question', 'quizzes', {
    scopeGroup: 'quizzesWrite',
    pathParams: idParams('questionId'),
  }),
  r('post', '/api/quizzes/{quizId}/attempts', 'Student: start a quiz attempt', 'quizzes', {
    scopeGroup: 'quizAttemptsWrite',
    pathParams: idParams('quizId'),
  }),
  r(
    'post',
    '/api/quiz-attempts/{attemptId}/submit',
    'Submit a quiz attempt (auto-grades objective items)',
    'quizzes',
    { scopeGroup: 'quizAttemptsWrite', pathParams: idParams('attemptId') },
  ),
  r('get', '/api/quiz-attempts/{attemptId}', 'Get a quiz attempt', 'quizzes', {
    scopeGroup: 'quizAttemptsRead',
    pathParams: idParams('attemptId'),
  }),
  r(
    'patch',
    '/api/quiz-attempts/{attemptId}',
    'Update a quiz attempt (in-progress answers)',
    'quizzes',
    { scopeGroup: 'quizAttemptsWrite', pathParams: idParams('attemptId') },
  ),
  r('post', '/api/quiz-answers/{answerId}/grade', 'Teacher: grade a subjective answer', 'quizzes', {
    scopeGroup: 'quizGradeWrite',
    pathParams: idParams('answerId'),
  }),
  r('get', '/api/quizzes/{quizId}/attempts', 'Teacher: list all attempts for a quiz', 'quizzes', {
    scopeGroup: 'quizAttemptsRead',
    pathParams: idParams('quizId'),
  }),
  r('get', '/api/me/quizzes/{quizId}/attempts', 'My attempts for a quiz', 'quizzes', {
    scopeGroup: 'quizAttemptsRead',
    pathParams: idParams('quizId'),
  }),
  r(
    'patch',
    '/api/quiz-attempts/{attemptId}/review',
    'Teacher: finalize manual review',
    'quizzes',
    { scopeGroup: 'quizGradeWrite', pathParams: idParams('attemptId') },
  ),

  // ---------- Attendance ----------
  r(
    'get',
    '/api/courses/{courseId}/attendance-sessions',
    'List attendance sessions',
    'attendance',
    { scopeGroup: 'attendanceRead', pathParams: idParams('courseId') },
  ),
  r(
    'post',
    '/api/courses/{courseId}/attendance-sessions',
    'Create an attendance session',
    'attendance',
    { scopeGroup: 'attendanceWrite', pathParams: idParams('courseId') },
  ),
  r('get', '/api/attendance-sessions/{sessionId}', 'Get an attendance session', 'attendance', {
    scopeGroup: 'attendanceRead',
    pathParams: idParams('sessionId'),
  }),
  r('patch', '/api/attendance-sessions/{sessionId}', 'Update an attendance session', 'attendance', {
    scopeGroup: 'attendanceWrite',
    pathParams: idParams('sessionId'),
  }),
  r(
    'post',
    '/api/attendance-sessions/{sessionId}/close',
    'Close an attendance session',
    'attendance',
    { scopeGroup: 'attendanceWrite', pathParams: idParams('sessionId') },
  ),
  r(
    'delete',
    '/api/attendance-sessions/{sessionId}',
    'Delete an attendance session',
    'attendance',
    { scopeGroup: 'attendanceWrite', pathParams: idParams('sessionId') },
  ),
  r(
    'get',
    '/api/attendance-sessions/{sessionId}/records',
    'List records for a session',
    'attendance',
    { scopeGroup: 'attendanceRead', pathParams: idParams('sessionId') },
  ),
  r(
    'post',
    '/api/attendance-sessions/{sessionId}/records',
    'Bulk upsert attendance records for a session',
    'attendance',
    { scopeGroup: 'attendanceWrite', pathParams: idParams('sessionId') },
  ),
  r(
    'get',
    '/api/courses/{courseId}/attendance/export.csv',
    'Export attendance CSV for a course',
    'attendance',
    { scopeGroup: 'attendanceRead', pathParams: idParams('courseId') },
  ),
  r(
    'get',
    '/api/me/courses/{courseId}/attendance',
    'My attendance records for a course',
    'attendance',
    { scopeGroup: 'attendanceRead', pathParams: idParams('courseId') },
  ),
  r(
    'get',
    '/api/me/courses/{courseId}/attendance-sessions/today',
    "Today's open attendance session for a course (if any), with whether the caller already signed",
    'attendance',
    { scopeGroup: 'attendanceRead', pathParams: idParams('courseId') },
  ),
  r(
    'post',
    '/api/me/attendance-sessions/{sessionId}/sign',
    'Self-sign attendance for a session scheduled today; records the requestor IP',
    'attendance',
    { scopeGroup: 'attendanceWrite', pathParams: idParams('sessionId') },
  ),

  // ---------- Grading policy & final grades ----------
  r('get', '/api/courses/{courseId}/grading-policy', 'Get the grading policy', 'grading', {
    scopeGroup: 'gradesRead',
    pathParams: idParams('courseId'),
  }),
  r(
    'put',
    '/api/courses/{courseId}/grading-policy',
    'Update the grading policy (sum must equal 100)',
    'grading',
    { scopeGroup: 'gradesWrite', pathParams: idParams('courseId') },
  ),
  r('get', '/api/courses/{courseId}/final-grades', 'List final grades for a course', 'grading', {
    scopeGroup: 'gradesRead',
    pathParams: idParams('courseId'),
  }),
  r(
    'post',
    '/api/courses/{courseId}/final-grades/recalculate',
    'Recalculate every final grade for a course',
    'grading',
    { scopeGroup: 'gradesWrite', pathParams: idParams('courseId') },
  ),
  r(
    'patch',
    '/api/final-grades/{finalGradeId}',
    'Teacher override of a final grade (score + reason)',
    'grading',
    { scopeGroup: 'gradesWrite', pathParams: idParams('finalGradeId') },
  ),
  r('get', '/api/me/courses/{courseId}/final-grade', 'My final grade for a course', 'grading', {
    scopeGroup: 'gradesRead',
    pathParams: idParams('courseId'),
  }),
  r(
    'get',
    '/api/courses/{courseId}/grades/export.csv',
    'Export final grades CSV for a course',
    'grading',
    { scopeGroup: 'gradesRead', pathParams: idParams('courseId') },
  ),

  // ---------- Alerts ----------
  r('get', '/api/courses/{courseId}/alerts', 'List alerts for a course', 'alerts', {
    scopeGroup: 'alertsRead',
    pathParams: idParams('courseId'),
  }),
  r('post', '/api/courses/{courseId}/alerts', 'Create a manual alert', 'alerts', {
    scopeGroup: 'alertsWrite',
    pathParams: idParams('courseId'),
  }),
  r(
    'post',
    '/api/courses/{courseId}/alerts/generate',
    'Run risk-rule evaluation for a course',
    'alerts',
    { scopeGroup: 'alertsWrite', pathParams: idParams('courseId') },
  ),
  r('post', '/api/alerts/{alertId}/resolve', 'Resolve / dismiss an alert', 'alerts', {
    scopeGroup: 'alertsWrite',
    pathParams: idParams('alertId'),
  }),
  r('get', '/api/me/alerts', 'My alerts (across courses)', 'alerts', { scopeGroup: 'alertsRead' }),
  r('post', '/api/me/alerts/{alertId}/read', 'Mark one of my alerts as read', 'alerts', {
    scopeGroup: 'alertsRead',
    pathParams: idParams('alertId'),
  }),

  // ---------- Dashboards ----------
  r('get', '/api/dashboards/admin', 'Admin dashboard aggregates', 'dashboards', {
    scopeGroup: 'dashboardsRead',
    roles: ['admin'],
  }),
  r('get', '/api/dashboards/teacher', 'Teacher dashboard aggregates', 'dashboards', {
    scopeGroup: 'dashboardsRead',
    roles: ['teacher', 'admin'],
  }),
  r('get', '/api/dashboards/student', 'Student dashboard aggregates', 'dashboards', {
    scopeGroup: 'dashboardsRead',
  }),
];

const TAG_DESCRIPTIONS: Record<string, string> = {
  meta: 'Service discovery (health, version, OpenAPI). No auth.',
  auth: 'Login, registration, JWT refresh, current user.',
  me: 'Authenticated user — preferences and self-service API tokens.',
  admin: 'Workspace administration. Admin-only.',
  teacher: 'Teacher self-service. Teacher-only.',
  invitations: 'Invitation codes (admin), plus public validation endpoint.',
  courses: 'Courses, teachers, enrollments.',
  modules: 'Modules within a course (ordered).',
  materials: 'Reading materials (upload, link, manual text).',
  files: 'R2-backed file assets. Direct multipart upload, presigned download.',
  presentations: 'In-app presentations and their slides.',
  gamma: 'Gamma-generated presentations (external rendering via gamma.app).',
  assignments: 'Assignments and submissions, including grading.',
  discussions: 'Discussion topics, threaded posts, per-student grades.',
  quizzes: 'Quizzes, questions, attempts, manual grading.',
  attendance: 'Attendance sessions, bulk-mark, CSV export.',
  grading: 'Grading policy, final-grade calculation, overrides, CSV.',
  alerts: 'Risk-rule alerts (auto + manual) and resolution.',
  dashboards: 'Per-role dashboard aggregates.',
};

function securityForRoute(route: RouteSpec): unknown[] | undefined {
  if (route.security === 'public') return undefined;
  if (route.security === 'jwt') return [{ bearerJwt: [] }];
  // 'either' — both JWT and API token accepted
  const scopes = route.scopeGroup ? Array.from(SCOPE_GROUPS[route.scopeGroup]) : [];
  return [{ bearerJwt: [] }, { apiToken: scopes }];
}

const SCHEMAS: Record<string, unknown> = {
  // ----- envelopes -----
  SuccessEnvelope: {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: {},
    },
  },
  ApiError: {
    type: 'object',
    required: ['success', 'error'],
    properties: {
      success: { type: 'boolean', enum: [false] },
      error: {
        type: 'object',
        required: ['code', 'message', 'i18nKey'],
        properties: {
          code: { type: 'string', enum: Object.values(ERROR_CODES) },
          message: { type: 'string' },
          i18nKey: { type: 'string', description: 'i18next key the client can localize.' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: {
                  type: 'array',
                  items: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
                },
                code: { type: 'string' },
                i18nKey: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  HealthResponse: {
    type: 'object',
    required: ['status', 'timestamp'],
    properties: {
      status: { type: 'string', enum: ['ok'] },
      timestamp: { type: 'string', format: 'date-time' },
    },
  },
  VersionResponse: {
    type: 'object',
    required: ['version'],
    properties: {
      version: { type: 'string' },
      commit: { type: 'string', nullable: true },
      builtAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  // ----- auth -----
  RegisterInput: {
    type: 'object',
    required: ['email', 'password', 'name', 'invitationCode'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8, maxLength: 128 },
      name: { type: 'string', minLength: 1, maxLength: 120 },
      invitationCode: { type: 'string', minLength: 1, maxLength: 64 },
    },
  },
  LoginInput: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 1, maxLength: 128 },
    },
  },
  RefreshInput: {
    type: 'object',
    required: ['refreshToken'],
    properties: { refreshToken: { type: 'string', minLength: 1, maxLength: 2048 } },
  },
  ForgotPasswordInput: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email' },
    },
  },
  ResetPasswordInput: {
    type: 'object',
    required: ['token', 'password'],
    properties: {
      token: { type: 'string', minLength: 1, maxLength: 128 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
    },
  },
  AuthLoginResponse: {
    type: 'object',
    required: ['accessToken', 'refreshToken', 'user'],
    properties: {
      accessToken: { type: 'string' },
      refreshToken: { type: 'string' },
      expiresIn: { type: 'integer', description: 'Access-token TTL in seconds.' },
      user: { $ref: '#/components/schemas/UserSelf' },
    },
  },
  UserSelf: {
    type: 'object',
    required: ['id', 'email', 'name', 'role'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      role: { type: 'string', enum: [...USER_ROLES] },
      preferredLanguage: { type: 'string' },
    },
  },
  UpdatePreferencesInput: {
    type: 'object',
    properties: { preferredLanguage: { type: 'string', enum: ['en', 'zh-CN'] } },
  },
  // ----- tokens -----
  CreateApiTokenInput: {
    type: 'object',
    required: ['name', 'scopes'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      scopes: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', enum: [...API_TOKEN_SCOPES] },
      },
      expiresAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateSelfApiTokenInput: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      expiresInDays: {
        type: 'integer',
        minimum: 1,
        maximum: 3650,
        nullable: true,
        description:
          'Optional lifetime. Omit for a non-expiring token. Server rejects any client-supplied scope; scope is auto-bound to caller role.',
      },
    },
  },
  ApiTokenCreated: {
    type: 'object',
    required: ['id', 'name', 'scopes', 'token'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      scopes: { type: 'array', items: { type: 'string' } },
      token: { type: 'string', description: 'Plaintext token. Shown ONCE — store it now.' },
      createdAt: { type: 'string', format: 'date-time' },
      lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
      expiresAt: { type: 'string', format: 'date-time', nullable: true },
      revokedAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  ValidateInvitationInput: {
    type: 'object',
    required: ['code'],
    properties: { code: { type: 'string', minLength: 1, maxLength: 64 } },
  },
};

function wrapAsSuccess(refOrSchema: string | undefined) {
  if (!refOrSchema) {
    return { $ref: '#/components/schemas/SuccessEnvelope' };
  }
  return {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: { data: { $ref: `#/components/schemas/${refOrSchema}` } },
      },
    ],
  };
}

function buildPathItem(route: RouteSpec) {
  const parameters: unknown[] = [];
  if (route.pathParams) {
    for (const name of route.pathParams) {
      parameters.push({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
    }
  }
  if (route.queryParams) {
    for (const q of route.queryParams) {
      parameters.push({
        name: q.name,
        in: 'query',
        required: q.required ?? false,
        description: q.description,
        schema: { type: 'string' },
      });
    }
  }

  const responses: Record<string, unknown> = {
    '200': {
      description: 'Success',
      content: {
        'application/json': { schema: wrapAsSuccess(route.responseSchema) },
      },
    },
    '400': {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' },
          example: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input',
              i18nKey: 'errors.validation',
            },
          },
        },
      },
    },
  };
  if (route.security !== 'public') {
    responses['401'] = {
      description: 'Unauthenticated',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' },
          example: {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              i18nKey: 'errors.unauthorized',
            },
          },
        },
      },
    };
    responses['403'] = {
      description: 'Forbidden / missing scope',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' },
          example: {
            success: false,
            error: {
              code: 'MISSING_SCOPE',
              message: 'Token lacks required scope',
              i18nKey: 'errors.missingScope',
            },
          },
        },
      },
    };
  }
  if (route.pathParams && route.pathParams.length > 0) {
    responses['404'] = {
      description: 'Not found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' },
          example: {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Resource not found', i18nKey: 'errors.notFound' },
          },
        },
      },
    };
  }

  const operation: Record<string, unknown> = {
    summary: route.summary,
    tags: [route.tag],
    parameters: parameters.length ? parameters : undefined,
    responses,
  };

  const security = securityForRoute(route);
  if (security) operation.security = security;
  else operation.security = [];

  if (route.roles && route.roles.length > 0) {
    operation.description = `Role requirement: ${route.roles.join(' or ')}.`;
  }
  if (route.scopeGroup) {
    const scopes = Array.from(SCOPE_GROUPS[route.scopeGroup]);
    const note = `API-token callers must hold at least one of: \`${scopes.join('`, `')}\`.`;
    operation.description = operation.description
      ? `${operation.description as string}\n\n${note}`
      : note;
  }
  if (route.requestSchema) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': { schema: { $ref: `#/components/schemas/${route.requestSchema}` } },
      },
    };
  } else if (route.method !== 'get' && route.method !== 'delete') {
    operation.requestBody = {
      required: false,
      content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
    };
  }
  return operation;
}

export function buildOpenApiSpec(opts: { serverUrl?: string } = {}): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of ROUTES) {
    const entry = paths[route.path] ?? (paths[route.path] = {});
    entry[route.method] = buildPathItem(route);
  }
  const tags = Object.entries(TAG_DESCRIPTIONS).map(([name, description]) => ({
    name,
    description,
  }));
  return {
    openapi: '3.1.0',
    info: {
      title: 'CourseWise API',
      version: '1.0.0',
      description:
        'CourseWise REST API. Two authentication mechanisms are supported on every authenticated route:\n\n' +
        '- **JWT** — `Authorization: Bearer <access_token>` issued by `/api/auth/login` / `/api/auth/refresh`.\n' +
        '- **API token** — `Authorization: Bearer <cmpt_…>` issued by an admin or teacher. Each token carries a fixed set of scopes; tokens without a required scope receive `403 MISSING_SCOPE`.\n\n' +
        'All responses use a unified envelope:\n' +
        '`{ "success": true, "data": ... }` or `{ "success": false, "error": { "code", "message", "i18nKey", "details?" } }`.',
    },
    servers: opts.serverUrl ? [{ url: opts.serverUrl }] : [{ url: 'http://localhost:8787' }],
    tags,
    components: {
      securitySchemes: {
        bearerJwt: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token issued by `/api/auth/login`.',
        },
        apiToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'cmpt',
          description:
            'Long-lived API token (prefix `cmpt_`). Carries scopes from `API_TOKEN_SCOPES`.',
        },
      },
      schemas: SCHEMAS,
    },
    paths,
  };
}
