import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ApiTokenScope,
  AssignmentStatus,
  AttendanceSessionStatus,
  AttendanceStatus,
  CourseStatus,
  DiscussionTopicStatus,
  FileAssetStatus,
  GradingPolicyCategory,
  InvitationStatus,
  LetterGradeThreshold,
  Locale,
  MaterialSourceType,
  MaterialStatus,
  PresentationStatus,
  QuizAttemptStatus,
  QuizQuestionType,
  QuizStatus,
  SubmissionStatus,
  UserRole,
  UserStatus,
} from './constants';
import type { GradingPolicy } from './validators';

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface VersionResponse {
  version: string;
  commit: string;
  builtAt: string | null;
}

export interface ApiErrorDetail {
  path: (string | number)[];
  code: string;
  i18nKey: string;
}

export interface ApiError {
  code: string;
  message: string;
  i18nKey: string;
  details?: ApiErrorDetail[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  preferredLanguage: Locale;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

export interface ApiTokenSummary {
  id: string;
  name: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface CreatedApiToken extends ApiTokenSummary {
  token: string;
}

export interface CourseSummary {
  id: string;
  code: string;
  title: string;
  description: string | null;
  termLabel: string | null;
  status: CourseStatus;
  gradingPolicy: GradingPolicy | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseDetail extends CourseSummary {
  teachers: Array<{ id: string; name: string; email: string; role: string }>;
  enrollmentCount: number;
}

export interface ModuleSummary {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationCodeSummary {
  id: string;
  code: string;
  courseId: string | null;
  courseTitle?: string | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  status: InvitationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ValidateInvitationCodeResponse {
  valid: boolean;
  courseTitle?: string | null;
}

export type TeacherInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface TeacherInvitationSummary {
  id: string;
  email: string;
  inviterName: string;
  inviterId: string;
  status: TeacherInvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedUserId: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedTeacherInvitation extends TeacherInvitationSummary {
  /** Plaintext token — only returned at create / resend time. */
  token: string;
  /** Pre-built sign-up URL. Falls back to a path when an origin is unknown. */
  inviteUrl: string;
}

export interface TeacherInvitationLookup {
  email: string;
  expiresAt: string;
  inviterName: string;
}

export interface TeacherSummary {
  id: string;
  name: string;
  email: string;
  courseCount: number;
  createdAt: string;
}

export interface MaterialSummary {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  description: string | null;
  type: string;
  sourceType: MaterialSourceType;
  content: string | null;
  externalUrl: string | null;
  fileAssetId: string | null;
  status: MaterialStatus;
  publishedAt: string | null;
  archivedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileAssetSummary {
  id: string;
  courseId: string | null;
  ownerId: string | null;
  bucket: string;
  objectKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  originalFilename: string | null;
  status: FileAssetStatus;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadFileResponse {
  fileAssetId: string;
  r2Key: string;
  sizeBytes: number;
  contentType: string;
  originalFilename: string;
  status: FileAssetStatus;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
}

export interface EnrollmentRow {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  enrolledAt: string;
  status: 'enrolled' | 'dropped' | 'completed';
}

export interface PresentationSummary {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  description: string | null;
  status: PresentationStatus;
  publishedAt: string | null;
  archivedAt: string | null;
  position: number;
  slideCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SlideSummary {
  id: string;
  presentationId: string;
  position: number;
  title: string | null;
  content: string | null;
  speakerNotes: string | null;
  layout: string | null;
  imageAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentSummary {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  maxScore: number | null;
  rubric: unknown;
  allowLateSubmission: boolean;
  attachmentFileId: string | null;
  status: AssignmentStatus;
  publishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  position: number;
  submissionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionSummary {
  id: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
  textAnswer: string | null;
  fileAssetId: string | null;
  submittedAt: string | null;
  score: number | null;
  feedback: string | null;
  gradedAt: string | null;
  gradedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionWithStudent extends SubmissionSummary {
  student: {
    id: string;
    name: string;
    email: string;
  };
}

export interface DiscussionTopicSummary {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  description: string | null;
  status: DiscussionTopicStatus;
  isGraded: boolean;
  isPinned: boolean;
  maxScore: number | null;
  publishedAt: string | null;
  archivedAt: string | null;
  postCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiscussionPostSummary {
  id: string;
  topicId: string;
  parentId: string | null;
  content: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  author: {
    id: string;
    name: string;
    role: UserRole;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DiscussionGradeRow {
  studentId: string;
  studentName: string;
  studentEmail: string;
  postCount: number;
  score: number | null;
  feedback: string | null;
  gradedAt: string | null;
}

export interface QuizSummary {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  description: string | null;
  status: QuizStatus;
  startTime: string | null;
  endTime: string | null;
  timeLimitMinutes: number | null;
  maxAttempts: number;
  maxScore: number | null;
  passingScore: number | null;
  publishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  questionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestionTeacherView {
  id: string;
  quizId: string;
  position: number;
  prompt: string;
  type: QuizQuestionType;
  options: string[] | null;
  correctAnswers: unknown;
  explanation: string | null;
  points: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestionStudentView {
  id: string;
  quizId: string;
  position: number;
  prompt: string;
  type: QuizQuestionType;
  options: string[] | null;
  points: number;
}

export interface QuizAttemptSummary {
  id: string;
  quizId: string;
  studentId: string;
  status: QuizAttemptStatus;
  startedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  teacherReviewed: boolean;
  gradedAt: string | null;
  gradedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizAttemptWithStudent extends QuizAttemptSummary {
  student: { id: string; name: string; email: string };
}

export interface QuizAnswerSummary {
  id: string;
  attemptId: string;
  questionId: string;
  answer: unknown;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  feedback: string | null;
  gradedById: string | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizAttemptDetail extends QuizAttemptSummary {
  quiz: QuizSummary;
  questions: QuizQuestionStudentView[] | QuizQuestionTeacherView[];
  answers: QuizAnswerSummary[];
  pendingReviewCount: number;
}

export interface AttendanceSessionSummary {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  sessionDate: string;
  status: AttendanceSessionStatus;
  closedAt: string | null;
  recordCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecordRow {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: AttendanceStatus;
  notes: string | null;
  recordedById: string | null;
  recordedAt: string;
  updatedAt: string;
}

export interface StudentAttendanceRow {
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  status: AttendanceStatus | null;
  notes: string | null;
}

// ---------- M5: Grading Policy ----------
export interface GradingPolicySummary {
  id: string;
  courseId: string;
  weightAttendance: number;
  weightAssignments: number;
  weightQuizzes: number;
  weightDiscussion: number;
  weightFinalProject: number;
  letters: LetterGradeThreshold[];
  version: number;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- M5: Final Grades ----------
export type CategoryScoreBreakdown = Record<
  GradingPolicyCategory,
  {
    raw: number | null;
    weight: number;
    weighted: number;
    detail?: Record<string, number | string | null>;
  }
>;

export interface FinalGradeSummary {
  id: string;
  courseId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  score: number | null;
  letterGrade: string | null;
  categoryScores: CategoryScoreBreakdown | null;
  gradingPolicySnapshot: GradingPolicy | null;
  isOutdated: boolean;
  teacherOverrideScore: number | null;
  teacherOverrideReason: string | null;
  finalizedAt: string | null;
  finalizedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecalculateFinalGradesResult {
  courseId: string;
  total: number;
  updated: number;
  policyVersion: number;
}

// ---------- M5: Alerts ----------
export interface AlertSummary {
  id: string;
  userId: string;
  courseId: string | null;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  body: string | null;
  linkUrl: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertWithStudent extends AlertSummary {
  student?: { id: string; name: string; email: string };
}

export interface GenerateAlertsResult {
  courseId: string;
  generated: number;
  byType: Partial<Record<AlertType, number>>;
}

// ---------- M5: Dashboards ----------
export interface AdminDashboardResponse {
  totals: {
    users: number;
    teachers: number;
    students: number;
    courses: number;
    activeCourses: number;
    openAlerts: number;
  };
  latestAlerts: AlertSummary[];
  lateSubmissionsLast7d: number;
}

export interface TeacherCourseSnapshot {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  enrollmentCount: number;
  ungradedSubmissions: number;
  ungradedQuizAnswers: number;
  openAlerts: number;
}

export interface TeacherDashboardResponse {
  courses: TeacherCourseSnapshot[];
  recentAlerts: AlertSummary[];
}

export interface StudentCourseSnapshot {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  attendanceRate: number | null;
  assignmentAverage: number | null;
  quizAverage: number | null;
  upcomingAssignments: number;
  openAlerts: number;
  finalScore: number | null;
  letterGrade: string | null;
}

export interface StudentDashboardResponse {
  courses: StudentCourseSnapshot[];
  recentAlerts: AlertSummary[];
}
