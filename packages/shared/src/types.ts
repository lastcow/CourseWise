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
  GammaJobStatus,
  GroupSetSignupMode,
  GroupSetSignupStatus,
  InvitationStatus,
  LetterGradeThreshold,
  Locale,
  MaterialSourceType,
  MaterialStatus,
  ModuleCadence,
  ModuleStatus,
  PresentationProvider,
  PresentationStatus,
  QuizAttemptStatus,
  QuizQuestionType,
  QuizStatus,
  R2CleanupJobStatus,
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

export interface SendResetLinkResponse {
  resetUrl: string;
  emailSent: boolean;
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

/** One recurring weekly class meeting: day 0-6 (Sun-Sat), 'HH:MM' times. */
export interface MeetingSlot {
  day: number;
  start: string;
  end: string;
}

export interface CourseSummary {
  id: string;
  code: string;
  title: string;
  description: string | null;
  termLabel: string | null;
  // Schedule window (ISO timestamps). Drive the course-home progress bar.
  startDate: string | null;
  endDate: string | null;
  /** When true, the course stops accepting submissions once endDate passes. */
  disableSubmissionsAfterEnd: boolean;
  /** Weekly meeting slots ("every Mon 1-2PM"). */
  meetingSlots: MeetingSlot[] | null;
  /** Teacher-chosen module chunking; null = modules are not schedule-driven. */
  moduleCadence: ModuleCadence | null;
  status: CourseStatus;
  /** External LMS this course was imported from / linked to; null = native. */
  lmsProvider: 'canvas' | null;
  gradingPolicy: GradingPolicy | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  bannerFileAssetId: string | null;
  bannerUrl: string | null;
  syllabusMd: string | null;
  syllabusFileAssetId: string | null;
  syllabusFileUrl: string | null;
  counts: {
    modules: number;
    assignments: number;
    presentations: number;
    students: number;
  };
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
  /** Students only see published modules. */
  status: ModuleStatus;
  publishedAt: string | null;
  /** Schedule window — auto-aligned from the course cadence, individually
   *  adjustable. Past endAt (or manually closed) the module grays out. */
  startAt: string | null;
  endAt: string | null;
  closedAt: string | null;
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
  courseId?: string | null;
  courseTitle?: string | null;
}

export interface RedeemInvitationCodeResponse {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  alreadyEnrolled: boolean;
  enrollmentId?: string;
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
  /**
   * True iff the backend successfully dispatched an invitation email to the
   * recipient. False means the admin still has to share the `inviteUrl`
   * out-of-band (either because no email provider is configured, or the send
   * failed and we treated it as best-effort).
   */
  emailSent: boolean;
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

/** Response shape shared by every AI chat endpoint (material tutor, etc.). */
export interface AiChatResponse {
  reply: string;
  /** True when the grounding context was clipped to fit the model window. */
  truncated: boolean;
}

/** One day of AI usage for the profile chart (zero-filled). */
export interface AiUsagePoint {
  date: string; // YYYY-MM-DD
  neurons: number;
  requests: number;
}

/** One row in the profile page's recent-usage list. */
export interface AiUsageEntry {
  id: string;
  feature: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  neurons: number | null;
  contextTitle: string | null;
  createdAt: string;
}

export interface AiUsageResponse {
  days: number;
  totals: { neurons: number; requests: number; promptTokens: number; completionTokens: number };
  points: AiUsagePoint[];
  recent: AiUsageEntry[];
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
  // Only populated when the caller has full-roster access (teacher/admin).
  studentNumber?: string | null;
  /**
   * Total active enrollments this student has across the school (not just
   * this course). Lets the UI surface "Enrolled in N courses" without a
   * second round-trip. Returned by the full-roster path only.
   */
  enrolledCourseCount?: number;
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
  externalUrl: string | null;
  provider: PresentationProvider | null;
  fileAssetId: string | null;
  // Public share. shareToken is null until the teacher has enabled sharing at
  // least once; shareEnabled controls whether the public viewer is live.
  shareToken: string | null;
  shareEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Returned by PATCH /courses/:cid/presentations/:pid/share so the teacher UI
// can show the freshly-minted share URL without a follow-up GET.
export interface PresentationShareState {
  shareToken: string | null;
  shareEnabled: boolean;
  shareEnabledAt: string | null;
}

// Returned by the public GET /share/presentations/:token endpoint. Stripped to
// the minimum needed to render the viewer — no internal IDs leak.
export interface PublicPresentationView {
  title: string;
  description: string | null;
  courseTitle: string;
  externalUrl: string | null;
  // Whether a downloadable .pptx is available via the public download route.
  hasDownload: boolean;
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

// Teacher-requested course export job (async ZIP build → emailed link).
export interface ExportShare {
  id: string;
  createdAt: string;
  expiresAt: string;
  maxDownloads: number;
  downloadCount: number;
  hasPassphrase: boolean;
  locked: boolean;
  lastDownloadedAt: string | null;
  /** Full share URL, returned ONCE at creation; null when listing. */
  url: string | null;
}

// Public (guest) metadata for a share token — no student PII.
export interface ExportShareMeta {
  courseCode: string;
  fileName: string;
  sizeBytes: number | null;
  expiresAt: string;
  requiresPassphrase: boolean;
  downloadsRemaining: number;
}

export interface CourseExportJob {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  sizeBytes: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

// ---------- Canvas LMS integration (P0 token connect + P1 course import) ----------

export type CanvasConnectionStatus = 'active' | 'expired' | 'revoked' | 'invalid' | 'error';

// Teacher-level Canvas connection. The raw token is write-only — reads expose
// only the last 4 characters.
export interface CanvasConnection {
  id: string;
  baseUrl: string;
  externalUserId: string | null;
  externalUserName: string | null;
  tokenLast4: string;
  tokenExpiresAt: string | null;
  status: CanvasConnectionStatus;
  lastValidatedAt: string | null;
  createdAt: string;
}

// A course as listed by the teacher's Canvas account (link picker).
export interface CanvasRemoteCourse {
  id: string;
  name: string | null;
  courseCode: string | null;
  term: string | null;
  startAt: string | null;
  endAt: string | null;
  totalStudents: number | null;
  /** Already imported/linked into CourseWise via this connection. */
  imported: boolean;
}

// CourseWise course ↔ Canvas course link (null connectionStatus/baseUrl when
// the owning connection row is gone).
export interface CanvasCourseLink {
  id: string;
  externalCourseId: string;
  externalCourseName: string | null;
  externalCourseCode: string | null;
  importedAt: string | null;
  lastRosterFetchAt: string | null;
  connectionStatus: CanvasConnectionStatus | null;
  canvasBaseUrl: string | null;
}

// summaryJson payload of a completed initial-import run.
export interface CanvasPushSummary {
  push: {
    modules: { created: number; updated: number; skippedImported: number };
    assignments: {
      created: number;
      updated: number;
      skippedImported: number;
      skippedNoModule: number;
    };
    moduleItems: { created: number };
  };
}

export interface CanvasImportSummary {
  structure: {
    assignmentGroups: { imported: number; skipped: number; weightRounded: string[] };
    assignments: { imported: number; skipped: number; quizStubs: number; scoreDropped?: number };
    modules: { imported: number; skipped: number };
    courseFields: { updated: string[]; keptLocal: string[] };
  };
  // Absent since the structure-only import decision; present on legacy runs.
  roster?: { entries: number; withEmail: number; withSisId: number; withLoginId: number };
}

export interface CanvasSyncRun {
  id: string;
  kind: 'initial_import' | 'structure_push';
  status: 'pending' | 'running' | 'done' | 'failed';
  // CanvasImportSummary once the run is done; null/unknown otherwise.
  summaryJson: unknown | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AssignmentSummary {
  id: string;
  courseId: string;
  moduleId: string | null;
  groupId: string | null;
  // Assignment-set membership (mutually exclusive with a direct groupId for
  // grading); null when the assignment isn't in a set.
  setId: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  // Scheduling window. start/end gate when students can open or submit
  // (both new starts and submit actions are blocked outside this window);
  // until is the absolute deadline for in-progress drafts that were
  // started inside the window.
  startDate: string | null;
  endDate: string | null;
  untilDate: string | null;
  maxScore: number | null;
  rubric: unknown;
  allowLateSubmission: boolean;
  // Late-submission penalty policy (only meaningful when allowLateSubmission is
  // true). All null ⇒ late is allowed with no deduction. The penalty deducts
  // `latePenaltyPercentPerPeriod`% for each started `latePenaltyPeriodHours`
  // window past the deadline, capped at `latePenaltyMaxPercent`%.
  latePenaltyPercentPerPeriod: number | null;
  latePenaltyPeriodHours: number | null;
  latePenaltyMaxPercent: number | null;
  attachmentFileId: string | null;
  status: AssignmentStatus;
  publishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  position: number;
  submissionCount?: number;
  // Submitted/late submissions that don't yet have a score recorded. Surfaced
  // on teacher-facing lists so the "view submissions" action shows a badge.
  ungradedSubmissionCount?: number;
  submissionMode: 'individual' | 'group';
  groupSetId: string | null;
  /**
   * Populated when the caller is a student and has interacted with this
   * assignment (draft created or submitted). Lets list views show the
   * student's current state without fanning out per-row queries.
   */
  mySubmission?: {
    id: string;
    status: SubmissionStatus;
    submittedAt: string | null;
    score: number | null;
    rawScore: number | null;
    latePenaltyPercent: number | null;
    latePenaltyWaived: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

// One file attached to a submission. Carries enough metadata (filename,
// size, type) to render a downloadable list without a per-file round-trip;
// the actual bytes come from GET /files/:fileAssetId/download-url.
export interface SubmissionAttachment {
  fileAssetId: string;
  filename: string | null;
  sizeBytes: number | null;
  contentType: string | null;
}

export interface SubmissionSummary {
  id: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
  textAnswer: string | null;
  // Files turned in with this submission. For group mode this is the team's
  // shared set (union across members); individual mode is the student's own.
  attachments: SubmissionAttachment[];
  submittedAt: string | null;
  // `score` is the FINAL stored grade (after any late penalty). `rawScore` is
  // the pre-penalty score the teacher entered; `latePenaltyPercent` is the
  // deduction actually applied (0 when none/waived), snapshotted at grade time.
  score: number | null;
  rawScore: number | null;
  latePenaltyPercent: number | null;
  latePenaltyWaived: boolean;
  feedback: string | null;
  gradedAt: string | null;
  gradedById: string | null;
  // Group-mode only: id of the shared group_submissions row.
  groupSubmissionId: string | null;
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

// ---------- Group submissions (PR2) ----------

export interface MyAssignmentSubmissionResponse {
  /** The caller's individual submission row. */
  submission: SubmissionSummary;
  /**
   * Present when the assignment is in group mode. Lets the student see
   * the shared content + teammate names without a second round-trip.
   */
  group?: {
    groupId: string;
    groupName: string;
    members: { studentId: string; name: string }[];
    sharedContent: string | null;
    attachments: SubmissionAttachment[];
    sharedSubmittedAt: string | null;
    sharedSubmittedById: string | null;
  };
}

export interface GroupSubmissionWithMembers {
  groupSubmissionId: string;
  groupId: string;
  groupName: string;
  sharedContent: string | null;
  attachments: SubmissionAttachment[];
  sharedSubmittedAt: string | null;
  sharedSubmittedById: string | null;
  members: SubmissionWithStudent[];
}

/** Returned by the grouped grading endpoint. */
export interface AssignmentSubmissionsByGroup {
  groups: GroupSubmissionWithMembers[];
  /**
   * Members who haven't been part of any submission yet (e.g. assignment
   * is group mode but no one in their group has touched it). Rendered in
   * the inbox as a "no submission yet" bucket.
   */
  ungroupedStudents: { id: string; name: string; email: string }[];
}

export interface DiscussionTopicSummary {
  id: string;
  courseId: string;
  moduleId: string | null;
  groupId: string | null;
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
  /** Author of the parent post (author-mode listing only) — powers the
   *  "reply to @name" context line outside the thread view. */
  parentAuthorName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Paginated posts response. Thread mode pages over ROOT posts (each page
 *  carries its complete reply subtrees; total = root count). Author mode is
 *  a flat page of one student's posts (total = that student's post count). */
export interface DiscussionPostsPage {
  posts: DiscussionPostSummary[];
  total: number;
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
  groupId: string | null;
  /** Quiz-set membership; when set, the set supplies the grading category. */
  setId: string | null;
  title: string;
  description: string | null;
  status: QuizStatus;
  startTime: string | null;
  endTime: string | null;
  /** Hard absolute cutoff. In-progress attempts auto-finalize here. */
  untilDate: string | null;
  timeLimitMinutes: number | null;
  maxAttempts: number;
  /** Exam mode: block copy/paste/right-click + flag tab switches during attempts. */
  lockdown: boolean;
  maxScore: number | null;
  passingScore: number | null;
  publishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  questionCount?: number;
  attemptCount?: number;
  pendingReviewCount?: number;
  /** True when this quiz has ≥1 tester schedule (access is gated by wave). */
  hasSchedules?: boolean;
  /**
   * Per-student resolved wave, present only on the student quiz-detail response
   * of a gated quiz. `blocked` means the student is enrolled but in no wave
   * (and there is no remainder wave). When present and not blocked, the window
   * fields below OVERRIDE the quiz-level fields for this student.
   */
  mySchedule?: QuizStudentSchedule | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizStudentSchedule {
  scheduleId: string | null;
  name: string | null;
  isRemainder: boolean;
  blocked: boolean;
  startTime: string | null;
  endTime: string | null;
  untilDate: string | null;
  timeLimitMinutes: number | null;
  maxAttempts: number;
}

export interface QuizScheduleSummary {
  id: string;
  quizId: string;
  name: string;
  position: number;
  isRemainder: boolean;
  startTime: string | null;
  endTime: string | null;
  untilDate: string | null;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizScheduleMember {
  studentId: string;
  name: string;
  email: string;
}

export interface QuizScheduleWithMembers extends QuizScheduleSummary {
  members: QuizScheduleMember[];
}

export interface QuizScheduleListResponse {
  schedules: QuizScheduleWithMembers[];
  /** Enrolled students not in any explicit wave. Absorbed by the remainder
   * wave if one exists, otherwise blocked from the quiz. */
  remainderPreview: { count: number; studentIds: string[] };
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
  /** Tab/app switches detected during a lockdown attempt. */
  lockdownViolations: number;
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
  /** Minutes past `sessionDate` at which a self-sign is recorded as `late`. */
  lateAfterMinutes: number | null;
  /** Minutes past `sessionDate` at which self-sign is rejected entirely. */
  absentAfterMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

// 'early' = before the self-sign window opens (more than
// ATTENDANCE_SELF_SIGN_OPEN_BEFORE_MINUTES before the session start).
export type AttendanceWindowState = 'early' | 'open' | 'late' | 'closed';

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

export interface TodayAttendanceSession {
  session: AttendanceSessionSummary;
  alreadySigned: boolean;
  /** Whether self-sign is currently 'open' (counts present), 'late', or 'closed' (rejected). */
  windowState: AttendanceWindowState;
  /** Whole minutes elapsed since `session.sessionDate` (clamped to >= 0). */
  minutesSinceStart: number;
}

// ---------- M5: Grading Policy ----------
export interface GradingPolicySummary {
  id: string;
  courseId: string;
  weightAttendance: number;
  letters: LetterGradeThreshold[];
  version: number;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- M5: Final Grades ----------
/** A student's membership in one group, carrying the parent group set ("group
 *  type") so the gradebook can label and section a group filter by set. */
export interface GradebookGroupMembership {
  groupSetId: string;
  groupSetName: string;
  groupId: string;
  groupName: string;
}

export interface FinalGradeSummary {
  id: string;
  courseId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  studentNumber?: string | null;
  /** How many of this student's item scores were teacher-entered without a
   *  submission (work handed in by email/paper). Roster display only. */
  overrideCount?: number;
  /** The student's group memberships across the course's group sets (≤1 per
   *  set). Drives the roster's group chips and the group filter. */
  groupMemberships?: GradebookGroupMembership[];
  /** Count of the student's assignment submissions handed in but not yet
   *  graded (status submitted/late). Roster display only. */
  ungradedCount?: number;
  score: number | null;
  letterGrade: string | null;
  groups: GroupScoreBreakdown[];
  attendance: { rate: number; weight: number; weighted: number } | null;
  gradingPolicySnapshot: {
    attendanceWeight: number;
    groups: Array<{ id: string; name: string; weight: number }>;
    letters: LetterGradeThreshold[];
  } | null;
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

// ---------- Assignment Groups ----------
export interface AssignmentGroup {
  id: string;
  courseId: string;
  name: string;
  weight: number;
  position: number;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupScoreItem {
  itemId: string;
  // 'set' is a rolled-up assignment set (see AssignmentSet) that contributes a
  // single score to its category; `members` carries the per-assignment detail.
  itemType: 'assignment' | 'quiz' | 'discussion' | 'set';
  title: string;
  score: number | null;
  max: number;
  // Only present when itemType === 'set': the individual member assignments and
  // their scores, for display beneath the set's rolled-up row.
  members?: GroupScoreItem[];
  // True when `score` is shown as 0 because the item is past its effective
  // deadline with no submitted/attempted work — a computed zero, not a stored
  // grade. Drives the "past due" badge in the gradebook.
  zeroedAsMissing?: boolean;
}

// Roll-up rule for an assignment set.
export type AssignmentSetRule = 'average' | 'highest' | 'weighted';

// A bundle of assignments graded individually but contributing ONE rolled-up
// score (per scoringRule) to the weighted category referenced by groupId.
export interface AssignmentSet {
  id: string;
  courseId: string;
  groupId: string | null;
  name: string;
  scoringRule: AssignmentSetRule;
  /** Per-member weights for the 'weighted' rule: { [assignmentId]: weight }.
   *  Relative shares; missing members default to 1. */
  memberWeights: Record<string, number> | null;
  position: number;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

// Roll-up rule for a quiz set (parallel to AssignmentSetRule).
export type QuizSetRule = 'average' | 'highest' | 'weighted';

// A bundle of quizzes graded individually but contributing ONE rolled-up score
// (per scoringRule) to the weighted category referenced by groupId. The quiz
// twin of AssignmentSet.
export interface QuizSet {
  id: string;
  courseId: string;
  groupId: string | null;
  name: string;
  scoringRule: QuizSetRule;
  /** Per-member weights for the 'weighted' rule: { [quizId]: weight }. */
  memberWeights: Record<string, number> | null;
  position: number;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupScoreBreakdown {
  groupId: string;
  groupName: string;
  weight: number;
  itemCount: number;
  itemsScored: number;
  raw: number | null;
  weighted: number;
  detail: GroupScoreItem[];
}

// ---------- M5: Gradebook student detail ----------
export interface GradebookCategoryRollup {
  raw: number | null;
  weight: number;
  weighted: number;
}

export interface GradebookAssignmentItem {
  assignmentId: string;
  submissionId: string | null;
  title: string;
  maxScore: number;
  score: number | null;
  /** Null when graded without a submission (teacher override of the score). */
  submittedAt: string | null;
  status: SubmissionStatus | null;
  feedback: string | null;
  isFinalProject: boolean;
  /** Group-mode assignment: the grade is shared by the whole team. */
  isGroup?: boolean;
  gradedAt: string | null;
  /** Computed 0 because past due with no submission/draft (not a stored score). */
  zeroedAsMissing?: boolean;
}

export interface GradebookQuizItem {
  quizId: string;
  attemptId: string | null;
  title: string;
  score: number | null;
  maxScore: number | null;
  status: QuizAttemptStatus | null;
  teacherReviewed: boolean;
  pendingReviewCount: number;
  /** Computed 0 because past due (quiz closed) with no submitted attempt. */
  zeroedAsMissing?: boolean;
}

export interface GradebookDiscussionItem {
  topicId: string;
  title: string;
  maxScore: number;
  score: number | null;
  feedback: string | null;
  gradedAt: string | null;
  /** Student's non-deleted posts in the topic; 0 means nothing to grade yet. */
  postCount: number;
  /** Computed 0 because past due (course ended) with no posts/grade. */
  zeroedAsMissing?: boolean;
}

export interface GradebookAttendanceItem {
  sessionId: string;
  recordId: string | null;
  title: string;
  sessionDate: string;
  status: AttendanceStatus | null;
  notes: string | null;
}

export interface GradebookStudentDetail {
  courseId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  finalGrade: FinalGradeSummary | null;
  gradingPolicy: GradingPolicySummary;
  attendance: GradebookCategoryRollup & { items: GradebookAttendanceItem[] };
  assignments: GradebookCategoryRollup & { items: GradebookAssignmentItem[] };
  finalProject: GradebookCategoryRollup & { items: GradebookAssignmentItem[] };
  quizzes: GradebookCategoryRollup & { items: GradebookQuizItem[] };
  discussion: GradebookCategoryRollup & { items: GradebookDiscussionItem[] };
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

/** Admin alert-center row: target user + owning course (null = system alert). */
export interface AlertWithContext extends AlertSummary {
  student?: { id: string; name: string; email: string };
  course?: { id: string; code: string; title: string } | null;
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

/** One day of system-wide activity counts (date is YYYY-MM-DD, UTC). */
export interface AdminActivityPoint {
  date: string;
  newUsers: number;
  enrollments: number;
  submissions: number;
  quizAttempts: number;
  posts: number;
}

export interface AdminActivityResponse {
  days: number;
  points: AdminActivityPoint[];
}

/** One day of system-wide AI usage for the admin dashboard chart. */
export interface AdminAiUsagePoint {
  date: string; // YYYY-MM-DD
  neurons: number;
  requests: number;
  promptTokens: number;
  completionTokens: number;
}

export interface AdminAiUsageResponse {
  /** Resolved day count ('all' resolves to the span since the first event). */
  days: number;
  totals: { neurons: number; requests: number; promptTokens: number; completionTokens: number };
  points: AdminAiUsagePoint[];
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

// One gradable item (assignment, quiz, or discussion topic) with a backlog
// of ungraded work, used to render per-item rows in the teacher's pending
// tasks rail.
export interface GradingTaskItem {
  id: string;
  title: string;
  count: number;
}

// Per-course "needs grading" data. The aggregate counts feed the teacher
// course overview; the per-item arrays feed the Modules page pending-tasks
// rail so each assignment/quiz/discussion needing grading gets its own row.
export interface CourseGradingSummary {
  courseId: string;
  ungradedSubmissions: number;
  ungradedQuizAnswers: number;
  ungradedDiscussions: number;
  assignmentTasks: GradingTaskItem[];
  quizTasks: GradingTaskItem[];
  discussionTasks: GradingTaskItem[];
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

export interface GammaTheme {
  id: string;
  name: string;
  previewUrl?: string | null;
}

export interface GammaGenerationJob {
  id: string;
  courseId: string;
  presentationId: string | null;
  status: GammaJobStatus;
  gammaUrl: string | null;
  exportUrl: string | null;
  errorMessage: string | null;
  creditsDeducted: number | null;
  creditsRemaining: number | null;
  materialIds: string[];
  requestParams: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateGammaPresentationResponse {
  presentationId: string;
  jobId: string;
}

// ---------- FERPA §99.32 disclosure log ----------
//
// A single recorded disclosure of the calling student's education records.
// One row per `audit_logs.disclosed_student_id` matching the student.
export interface DisclosureLogEntry {
  id: string;
  occurredAt: string;
  // Raw action key (e.g. "grades.export.csv"). The frontend maps known keys
  // to friendly labels and falls back to the raw key for anything new.
  action: string;
  actor: {
    type: 'user' | 'api_token' | 'system';
    // Human-readable identifier of who performed the disclosure. For a
    // logged-in user this is their name; for an API token this is the
    // token's display name; for system events this may be null.
    name: string | null;
    role: 'admin' | 'teacher' | 'student' | null;
  };
  // The audit row's target field, raw. Usually a course id or sub-resource
  // id depending on the action.
  target: string | null;
  // Whatever metadata the disclosing route attached (assignment id, course
  // id, session count, etc.). Free-form by design.
  metadata: Record<string, unknown> | null;
}

export interface DisclosureLogResponse {
  items: DisclosureLogEntry[];
  total: number;
  // Offset of the next page, or null when there are no more rows.
  nextOffset: number | null;
}

// FERPA §99.20 record-correction-request enums live in ./constants.ts so
// the zod validators can use them.
import type { RecordCorrectionStatus, RecordCorrectionTarget } from './constants';
export type { RecordCorrectionStatus, RecordCorrectionTarget } from './constants';

export interface RecordCorrectionRequestSummary {
  id: string;
  studentId: string;
  studentName: string;
  // Set when the request scopes to a specific course (almost always except
  // profile-corrections).
  courseId: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  targetType: RecordCorrectionTarget;
  targetId: string | null;
  description: string;
  status: RecordCorrectionStatus;
  resolutionNote: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// FERPA §99.10(a) — every student can inspect/review their own education
// records on request. This shape is the JSON payload `/me/records/export`
// returns: every row in our database where the calling user is the subject.
// Cross-referenced contextual fields (course code, quiz title, etc.) are
// joined inline so the export is readable standalone.
//
// Bumping `schemaVersion` is the canary if downstream consumers (e.g. a
// student importing into another LMS) might break on a shape change.
export interface MyRecordsExport {
  schemaVersion: 1;
  exportedAt: string;
  profile: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'teacher' | 'student';
    preferredLanguage: string;
    createdAt: string;
    lastLoginAt: string | null;
    studentNumber: string | null;
    enrollmentYear: number | null;
  };
  enrollments: Array<{
    courseId: string;
    courseCode: string;
    courseTitle: string;
    termLabel: string | null;
    status: string;
    enrolledAt: string;
  }>;
  submissions: Array<{
    id: string;
    assignmentId: string;
    assignmentTitle: string;
    courseId: string;
    courseCode: string;
    status: string;
    content: string | null;
    fileAssetId: string | null;
    score: string | null;
    feedback: string | null;
    submittedAt: string | null;
    gradedAt: string | null;
  }>;
  quizAttempts: Array<{
    id: string;
    quizId: string;
    quizTitle: string;
    courseId: string;
    status: string;
    score: string | null;
    startedAt: string;
    submittedAt: string | null;
    answers: Array<{
      questionId: string;
      answer: unknown;
      isCorrect: boolean | null;
      pointsAwarded: string | null;
    }>;
  }>;
  attendance: Array<{
    sessionId: string;
    sessionTitle: string;
    courseId: string;
    sessionDate: string;
    status: string;
    notes: string | null;
    ipAddress: string | null;
    recordedAt: string;
  }>;
  discussionPosts: Array<{
    id: string;
    topicId: string;
    topicTitle: string;
    courseId: string;
    content: string | null;
    isDeleted: boolean;
    createdAt: string;
  }>;
  discussionGrades: Array<{
    topicId: string;
    topicTitle: string;
    courseId: string;
    score: string | null;
    feedback: string | null;
  }>;
  finalGrades: Array<{
    courseId: string;
    courseCode: string;
    letterGrade: string | null;
    score: string | null;
    teacherOverrideScore: string | null;
    teacherOverrideReason: string | null;
  }>;
  alerts: Array<{
    id: string;
    courseId: string | null;
    type: string;
    severity: string;
    body: string | null;
    createdAt: string;
  }>;
  disclosures: DisclosureLogEntry[];
}

// ---------- Course hard-delete ----------
export type ChildCounts = {
  enrollments: number;
  modules: number;
  readingMaterials: number;
  assignments: number;
  submissions: number;
  quizzes: number;
  quizAttempts: number;
  discussionTopics: number;
  discussionPosts: number;
  attendanceSessions: number;
  fileCount: number;
  fileBytes: number;
};

export type CourseDeletionPreview = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  counts: ChildCounts;
};

export type R2CleanupJob = {
  id: string;
  courseId: string;
  status: R2CleanupJobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type CourseDeletionLogEntry = {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  deletedBy: string | null;
  deletedByName: string | null;
  deletedAt: string;
  childCounts: ChildCounts;
  cleanup: R2CleanupJob | null;
};

// ---------- Student groups (Canvas-style group sets) ----------

export interface GroupSetSummary {
  id: string;
  courseId: string;
  name: string;
  maxMembersPerGroup: number;
  signupMode: GroupSetSignupMode;
  signupStatus: GroupSetSignupStatus;
  groupCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  studentId: string;
  name: string;
  email: string;
  joinedAt: string;
}

export interface GroupWithMembers {
  id: string;
  groupSetId: string;
  name: string;
  position: number;
  /** NULL when the group inherits the set's maxMembersPerGroup. Set when
   *  a teacher/admin force-assigned a student into a full group. */
  maxMembersOverride: number | null;
  members: GroupMember[];
}

export interface UnassignedStudent {
  studentId: string;
  name: string;
  email: string;
}

export interface GroupSetWithGroups extends GroupSetSummary {
  groups: GroupWithMembers[];
  unassignedStudents: UnassignedStudent[];
  myGroupId: string | null;
}

// -------- Messaging --------

export const MESSAGE_PRIORITIES = ['normal', 'high', 'urgent'] as const;
export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number];

export interface MessageParticipantSummary {
  id: string;
  name: string;
  email: string;
}

export interface MessageThreadSummary {
  threadId: string;
  courseId: string;
  subject: string;
  otherParticipant: MessageParticipantSummary;
  lastMessageAt: string;
  lastMessageSenderId: string | null;
  lastMessagePreview: string;
  unreadCount: number;
  highestUnreadPriority: MessagePriority | null;
}

export interface MessageAttachment {
  fileAssetId: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
}

export interface MessageRecord {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  priority: MessagePriority;
  createdAt: string;
  readAtByRecipient: string | null;
  attachment: MessageAttachment | null;
}

export interface MessageThreadDetail {
  threadId: string;
  courseId: string;
  subject: string;
  otherParticipant: MessageParticipantSummary;
  messages: MessageRecord[];
}

export interface SendMessageInput {
  recipientId: string;
  threadId?: string;
  subject?: string;
  body: string;
  priority?: MessagePriority;
  /** A ready file-asset uploaded with relatedType 'message', owned by the sender. */
  fileAssetId?: string;
}

export interface UnreadCountResponse {
  total: number;
}

// -------- Announcements --------

export const ANNOUNCEMENT_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_AUDIENCES = ['course', 'groups'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_PRIORITIES = ['normal', 'high', 'urgent'] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export interface AnnouncementAttachment {
  fileAssetId: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Whether the calling user reacted with this emoji. */
  reacted: boolean;
}

export interface AnnouncementComment {
  id: string;
  announcementId: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  reactions: ReactionSummary[];
  /** Whether the caller may delete this comment (its author or a teacher). */
  canDelete: boolean;
}

export interface AnnouncementSummary {
  id: string;
  courseId: string;
  authorId: string | null;
  authorName: string | null;
  title: string;
  /** Markdown. Included in the list payload so the student feed renders inline. */
  body: string;
  status: AnnouncementStatus;
  pinned: boolean;
  priority: AnnouncementPriority;
  /** When false, students can't post new comments. */
  allowComments: boolean;
  audience: AnnouncementAudience;
  /** Group ids this announcement targets (empty when audience = 'course'). */
  targetGroupIds: string[];
  attachments: AnnouncementAttachment[];
  /** Number of non-deleted comments. */
  commentCount: number;
  /** Announcement-level emoji reactions. */
  reactions: ReactionSummary[];
  /** When status='scheduled', the time the cron will auto-publish. */
  publishAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Whether the calling user has read this announcement. */
  isRead: boolean;
  /** Teacher-only: how many recipients have read it, and the audience size. */
  readCount?: number;
  audienceCount?: number;
}

// -------- Student profile (Modify dialog) --------

export interface StudentProfileEnrollmentRow {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  status: string;
  enrolledAt: string;
}

export interface StudentProfileDetail {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  studentNumber: string | null;
  enrollmentYear: number | null;
  preferredLanguage: string;
  enrollments: StudentProfileEnrollmentRow[];
}

export interface UpdateStudentProfileInput {
  name?: string;
  /** Pass null to clear, omit to leave unchanged, or a string to set. */
  studentNumber?: string | null;
}

export interface DeleteStudentAccountInput {
  reason?: string | null;
}

export type DeleteEmailStatus = 'sent' | 'failed' | 'skipped';

export interface DeleteStudentAccountResponse {
  id: string;
  emailStatus: DeleteEmailStatus;
}
