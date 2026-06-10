import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminActivityResponse,
  AdminDashboardResponse,
  AiArtifactKind,
  AssignmentGroup,
  AssignmentSet,
  AssignmentSetRule,
  AiModelSummary,
  AiPromptTemplate,
  AiProviderSummary,
  AlertStatus,
  AlertSummary,
  AlertWithContext,
  AlertWithStudent,
  AiJobDetail,
  AiJobSummary,
  AiModelOption,
  ApiError,
  ApiResponse,
  ApiTokenSummary,
  AssignGroupMemberInput,
  AssignmentSummary,
  AttendanceRecordRow,
  AttendanceSessionSummary,
  AttendanceStatus,
  BulkMarkAttendanceInput,
  CourseDeletionLogEntry,
  CourseDeletionPreview,
  CourseDetail,
  CourseExportJob,
  CourseGradingSummary,
  CourseSummary,
  CreateAiModelInput,
  CreateAiProviderInput,
  CreateAssignmentInput,
  CreateAttendanceSessionInput,
  CreateCourseInput,
  CreatedApiToken,
  CreateDiscussionPostInput,
  CreateDiscussionTopicInput,
  CreateInvitationCodeInput,
  CreatedTeacherInvitation,
  CreateTeacherInvitationInput,
  CreateManualAlertInput,
  CreateMaterialInput,
  CreateModuleInput,
  CreatePresentationInput,
  CreateQuizInput,
  CreateQuizQuestionInput,
  CreateGammaPresentationResponse,
  CreateGroupSetInput,
  CreateSelfApiTokenInput,
  CreateSlideInput,
  CreateRecordCorrectionRequestInput,
  DisclosureLogResponse,
  RecordCorrectionRequestSummary,
  RecordCorrectionStatus,
  ResolveRecordCorrectionRequestInput,
  DiscussionGradeRow,
  DiscussionPostSummary,
  DiscussionTopicSummary,
  EnrollmentRow,
  FinalGradeSummary,
  GammaGenerationJob,
  GammaTheme,
  GenerateAlertsResult,
  GenerateGammaPresentationInput,
  GenerateMaterialsInput,
  GradebookStudentDetail,
  GradeDiscussionInput,
  GradeQuizAnswerInput,
  GradeSubmissionInput,
  GradingPolicySummary,
  GroupSetSummary,
  GroupSetWithGroups,
  AssignmentSubmissionsByGroup,
  MyAssignmentSubmissionResponse,
  InvitationCodeSummary,
  LoginResponse,
  RegisterTeacherInput,
  TeacherInvitationLookup,
  TeacherInvitationStatus,
  TeacherInvitationSummary,
  TeacherSummary,
  MaterialSummary,
  ModuleSummary,
  OverrideFinalGradeInput,
  PresentationShareState,
  PresentationSummary,
  RedeemInvitationCodeResponse,
  QuizAttemptDetail,
  QuizAttemptSummary,
  QuizAttemptWithStudent,
  QuizQuestionStudentView,
  QuizQuestionTeacherView,
  QuizScheduleListResponse,
  QuizScheduleSummary,
  QuizScheduleWithMembers,
  QuizSet,
  QuizSetRule,
  QuizSummary,
  CreateQuizScheduleInput,
  UpdateQuizScheduleInput,
  SetScheduleMembersInput,
  RecalculateFinalGradesResult,
  ReorderModulesInput,
  ReorderQuizQuestionsInput,
  ReorderSlidesInput,
  ReplyDiscussionPostInput,
  ResolveAlertInput,
  ReturnSubmissionInput,
  SaveQuizAttemptAnswersInput,
  SlideSummary,
  StudentAttendanceRow,
  TodayAttendanceSession,
  StudentDashboardResponse,
  SubmissionAttachment,
  SubmissionSummary,
  SubmissionWithStudent,
  SubmitQuizAttemptInput,
  TeacherDashboardResponse,
  UpdateAssignmentInput,
  UpdateAttendanceSessionInput,
  UpdateCourseInput,
  UpdateDiscussionPostInput,
  UpdateDiscussionTopicInput,
  UpdateGradingPolicyInput,
  UpdateGroupInput,
  UpdateGroupSetInput,
  UpdateAiModelInput,
  UpdateAiPromptTemplateInput,
  UpdateAiProviderInput,
  UpdateMaterialInput,
  UpdateModuleInput,
  UpdatePresentationInput,
  UpdateQuizInput,
  UpdateQuizQuestionInput,
  UpdateSlideInput,
  UpdateSubmissionInput,
  UploadFileResponse,
  ValidateInvitationCodeResponse,
  MessageThreadSummary,
  MessageThreadDetail,
  SendMessageInput,
  UnreadCountResponse,
  MessageRecord,
  StudentProfileDetail,
  UpdateStudentProfileInput,
  DeleteStudentAccountResponse,
  SendResetLinkResponse,
} from '@coursewise/shared';
import { ApiClientError, apiCall, getStoredAuth } from './api';

export function useCoursesList() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: () => apiCall<CourseSummary[]>('/api/courses'),
  });
}

export function useCourse(courseId: string | null) {
  return useQuery({
    queryKey: ['course', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<CourseDetail>(`/api/courses/${courseId}`),
  });
}

export function useCourseGradingSummary(courseId: string | null) {
  return useQuery({
    queryKey: ['course-grading-summary', courseId],
    enabled: !!courseId,
    queryFn: () =>
      apiCall<CourseGradingSummary>(`/api/courses/${courseId}/grading-summary`),
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCourseInput) =>
      apiCall<CourseSummary>('/api/courses', { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCourseInput }) =>
      apiCall<CourseSummary>(`/api/courses/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['courses'] });
      void qc.invalidateQueries({ queryKey: ['course', vars.id] });
    },
  });
}

export function useArchiveCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activate }: { id: string; activate: boolean }) =>
      apiCall<CourseSummary>(`/api/courses/${id}/${activate ? 'activate' : 'archive'}`, {
        method: 'POST',
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['courses'] });
      void qc.invalidateQueries({ queryKey: ['course', vars.id] });
    },
  });
}

export function useDeletionPreview(courseId: string | null | undefined) {
  return useQuery({
    queryKey: ['course-deletion-preview', courseId],
    enabled: !!courseId,
    queryFn: () =>
      apiCall<CourseDeletionPreview>(`/api/courses/${courseId}/deletion-preview`),
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, confirmCode }: { courseId: string; confirmCode: string }) =>
      apiCall<{ id: string }>(`/api/courses/${courseId}`, {
        method: 'DELETE',
        body: { confirmCode },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['courses'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'course-deletion-log'] });
    },
  });
}

export function useCourseDeletionLog() {
  return useQuery({
    queryKey: ['admin', 'course-deletion-log'],
    queryFn: () => apiCall<CourseDeletionLogEntry[]>('/api/admin/course-deletion-log'),
  });
}

export function useRetryR2Cleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      // The retry endpoint responds 202 with an empty body on success, so
      // bypass the JSON-envelope parsing and check the status code directly.
      const res = await apiCall<Response>(`/api/admin/r2-cleanup-jobs/${jobId}/retry`, {
        method: 'POST',
        raw: true,
      });
      if (!res.ok) {
        const text = await res.text();
        let err: ApiError = {
          code: 'UNKNOWN',
          message: res.statusText,
          i18nKey: 'errors.internal',
        };
        try {
          const parsed = text ? (JSON.parse(text) as ApiResponse<unknown>) : undefined;
          if (parsed && parsed.success === false) err = parsed.error;
        } catch {
          /* fall through with default err */
        }
        throw new ApiClientError(res.status, err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'course-deletion-log'] }),
  });
}

// Modules
export function useModulesList(courseId: string | null) {
  return useQuery({
    queryKey: ['modules', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<ModuleSummary[]>(`/api/courses/${courseId}/modules`),
  });
}

export function useCreateModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateModuleInput) =>
      apiCall<ModuleSummary>(`/api/courses/${courseId}/modules`, { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules', courseId] }),
  });
}

export function useUpdateModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateModuleInput }) =>
      apiCall<ModuleSummary>(`/api/modules/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules', courseId] }),
  });
}

export function useDeleteModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiCall<{ id: string }>(`/api/modules/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules', courseId] }),
  });
}

export function useReorderModules(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderModulesInput) =>
      apiCall<ModuleSummary[]>(`/api/courses/${courseId}/modules/reorder`, { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules', courseId] }),
  });
}

export function useTransitionModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'unpublish' }) =>
      apiCall<ModuleSummary>(`/api/modules/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules', courseId] }),
  });
}

// Recompute every module's window from the course schedule (by position).
export function useAlignModules(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<ModuleSummary[]>(`/api/courses/${courseId}/modules/align`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules', courseId] }),
  });
}

// Materials
export function useMaterialsList(courseId: string | null) {
  return useQuery({
    queryKey: ['materials', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<MaterialSummary[]>(`/api/courses/${courseId}/materials`),
  });
}

export function useMaterial(materialId: string | null) {
  return useQuery({
    queryKey: ['material', materialId],
    enabled: !!materialId,
    queryFn: () => apiCall<MaterialSummary>(`/api/materials/${materialId}`),
  });
}

export function useCreateMaterial(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaterialInput) =>
      apiCall<MaterialSummary>(`/api/courses/${courseId}/materials`, { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', courseId] }),
  });
}

export function useUpdateMaterial(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMaterialInput }) =>
      apiCall<MaterialSummary>(`/api/materials/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['materials', courseId] });
      void qc.invalidateQueries({ queryKey: ['material', data.id] });
    },
  });
}

export function useTransitionMaterial(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'archive' }) =>
      apiCall<MaterialSummary>(`/api/materials/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', courseId] }),
  });
}

export function useDeleteMaterial(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ id: string }>(`/api/materials/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', courseId] }),
  });
}

// Invitation codes
export function useInvitationCodesList() {
  return useQuery({
    queryKey: ['invitation-codes'],
    queryFn: () => apiCall<InvitationCodeSummary[]>('/api/invitation-codes'),
  });
}

export function useCreateInvitationCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitationCodeInput) =>
      apiCall<InvitationCodeSummary>('/api/invitation-codes', { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitation-codes'] }),
  });
}

export function useDeactivateInvitationCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<InvitationCodeSummary>(`/api/invitation-codes/${id}/deactivate`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invitation-codes'] });
      void qc.invalidateQueries({ queryKey: ['course-invitation-codes'] });
    },
  });
}

// Course-scoped invitation codes (teacher-accessible).
export function useCourseInvitationCodes(courseId: string | null) {
  return useQuery({
    queryKey: ['course-invitation-codes', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<InvitationCodeSummary[]>(`/api/courses/${courseId}/invitation-codes`),
  });
}

export function useCreateCourseInvitationCode(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateInvitationCodeInput, 'courseId'>) =>
      apiCall<InvitationCodeSummary>(`/api/courses/${courseId}/invitation-codes`, {
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['course-invitation-codes', courseId] });
    },
  });
}

export function validateInvitationCode(code: string) {
  // Validation endpoint requires Bearer auth as of COU-17; callers must
  // already be signed in.
  return apiCall<ValidateInvitationCodeResponse>('/api/invitation-codes/validate', {
    method: 'POST',
    body: { code },
  });
}

export function useValidateInvitationCode(code: string | undefined) {
  return useQuery({
    queryKey: ['invitation-code-validate', code],
    queryFn: () =>
      apiCall<ValidateInvitationCodeResponse>('/api/invitation-codes/validate', {
        method: 'POST',
        body: { code: code! },
      }),
    enabled: !!code,
    retry: false,
  });
}

export function useRedeemInvitationCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiCall<RedeemInvitationCodeResponse>('/api/invitation-codes/redeem', {
        method: 'POST',
        body: { code },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['courses'] });
      void qc.invalidateQueries({ queryKey: ['dashboard', 'student'] });
    },
  });
}

// ---------- Self-serve API tokens (Settings → API Tokens) ----------
export function useMyApiTokens() {
  return useQuery({
    queryKey: ['my-api-tokens'],
    queryFn: () => apiCall<{ tokens: ApiTokenSummary[] }>('/api/me/api-tokens'),
  });
}

// FERPA §99.7(a) annual acknowledgment. GET reads whether the calling user
// has already acknowledged the current academic year; POST records the
// acknowledgment. Polled with `enabled=true` is enough — once acknowledged
// the modal stays hidden until next July.
export interface FerpaAcknowledgmentState {
  acknowledged: boolean;
  academicYear: string;
}

export function useMyFerpaAcknowledgment() {
  return useQuery({
    queryKey: ['my-ferpa-acknowledgment'],
    queryFn: () =>
      apiCall<FerpaAcknowledgmentState>('/api/me/ferpa-acknowledgment'),
  });
}

export function useAcknowledgeFerpa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<FerpaAcknowledgmentState>('/api/me/ferpa-acknowledgment', {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-ferpa-acknowledgment'] });
    },
  });
}

export function useMyDisclosures(offset: number, limit = 50) {
  return useQuery({
    queryKey: ['my-disclosures', offset, limit],
    queryFn: () =>
      apiCall<DisclosureLogResponse>(
        `/api/me/records/disclosures?limit=${limit}&offset=${offset}`,
      ),
    // Keep prior page while loading the next so the UI doesn't flash empty.
    placeholderData: (prev) => prev,
  });
}

// FERPA §99.20 — record correction requests.

export function useMyCorrectionRequests() {
  return useQuery({
    queryKey: ['my-correction-requests'],
    queryFn: () =>
      apiCall<RecordCorrectionRequestSummary[]>('/api/me/record-correction-requests'),
  });
}

export function useCreateCorrectionRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecordCorrectionRequestInput) =>
      apiCall<RecordCorrectionRequestSummary>('/api/me/record-correction-requests', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-correction-requests'] });
    },
  });
}

export function useWithdrawCorrectionRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<RecordCorrectionRequestSummary>(
        `/api/me/record-correction-requests/${id}/withdraw`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-correction-requests'] });
    },
  });
}

export function useCourseCorrectionRequests(
  courseId: string | null,
  status?: RecordCorrectionStatus,
) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return useQuery({
    queryKey: ['course-correction-requests', courseId, status ?? 'all'],
    enabled: !!courseId,
    queryFn: () =>
      apiCall<RecordCorrectionRequestSummary[]>(
        `/api/courses/${courseId}/record-correction-requests${query}`,
      ),
  });
}

export function useResolveCorrectionRequest(courseId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolveRecordCorrectionRequestInput }) =>
      apiCall<RecordCorrectionRequestSummary>(
        `/api/record-correction-requests/${id}/resolve`,
        { method: 'POST', body: input },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['course-correction-requests', courseId] });
    },
  });
}

export function useCreateMyApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSelfApiTokenInput) =>
      apiCall<CreatedApiToken>('/api/me/api-tokens', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-api-tokens'] }),
  });
}

export function useRevokeMyApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ ok: boolean }>(`/api/me/api-tokens/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-api-tokens'] }),
  });
}

// Teacher invitations
export interface TeacherInvitationListPage {
  items: TeacherInvitationSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export function useTeachersList() {
  return useQuery({
    queryKey: ['admin-teachers'],
    queryFn: () => apiCall<TeacherSummary[]>('/api/admin/teachers'),
  });
}

export function useTeacherInvitationsList(status: TeacherInvitationStatus | 'all' = 'pending') {
  return useQuery({
    queryKey: ['teacher-invitations', status],
    queryFn: () => {
      const q = status === 'all' ? '' : `?status=${status}`;
      return apiCall<TeacherInvitationListPage>(`/api/admin/teacher-invitations${q}`);
    },
  });
}

export function useCreateTeacherInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeacherInvitationInput) =>
      apiCall<CreatedTeacherInvitation>('/api/admin/teacher-invitations', { body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-invitations'] });
      qc.invalidateQueries({ queryKey: ['admin-teachers'] });
    },
  });
}

export function useRevokeTeacherInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<TeacherInvitationSummary>(`/api/admin/teacher-invitations/${id}/revoke`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher-invitations'] }),
  });
}

export function useResendTeacherInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<CreatedTeacherInvitation>(`/api/admin/teacher-invitations/${id}/resend`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher-invitations'] }),
  });
}

export function lookupTeacherInvitation(token: string) {
  return apiCall<TeacherInvitationLookup>(
    `/api/auth/teacher-invitations/${encodeURIComponent(token)}`,
    { auth: false },
  );
}

export function registerTeacher(input: RegisterTeacherInput) {
  return apiCall<LoginResponse>('/api/auth/register-teacher', {
    body: input,
    auth: false,
  });
}

// Files
export function getDownloadUrl(fileId: string) {
  return apiCall<{ downloadUrl: string; fileName: string | null }>(
    `/api/files/${fileId}/download-url`,
  );
}

const API_BASE: string =
  (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ?? '';

export function uploadFile(
  file: File,
  courseId: string,
  relatedType: 'material' | 'assignment' | 'submission' | 'course' | 'presentation' = 'material',
  onProgress?: (pct: number) => void,
): Promise<UploadFileResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('courseId', courseId);
  form.append('relatedType', relatedType);
  const accessToken = getStoredAuth()?.accessToken;

  return new Promise<UploadFileResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/files/upload`);
    if (accessToken) xhr.setRequestHeader('authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { success?: boolean; data?: UploadFileResponse; error?: { message?: string } };
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error(`Upload failed (${xhr.status}): non-JSON response`));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.success && body.data) {
        resolve(body.data);
      } else {
        reject(new Error(body.error?.message ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed (network error)'));
    xhr.send(form);
  });
}

// =================== Presentations ===================
export function usePresentationsList(courseId: string | null) {
  return useQuery({
    queryKey: ['presentations', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<PresentationSummary[]>(`/api/courses/${courseId}/presentations`),
  });
}

export function usePresentation(presentationId: string | null) {
  return useQuery({
    queryKey: ['presentation', presentationId],
    enabled: !!presentationId,
    queryFn: () => apiCall<PresentationSummary>(`/api/presentations/${presentationId}`),
  });
}

export function useCreatePresentation(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePresentationInput) =>
      apiCall<PresentationSummary>(`/api/courses/${courseId}/presentations`, { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presentations', courseId] }),
  });
}

export function useUpdatePresentation(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePresentationInput }) =>
      apiCall<PresentationSummary>(`/api/presentations/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['presentations', courseId] });
      void qc.invalidateQueries({ queryKey: ['presentation', v.id] });
    },
  });
}

export function useTransitionPresentation(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'archive' }) =>
      apiCall<PresentationSummary>(`/api/presentations/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['presentations', courseId] });
      void qc.invalidateQueries({ queryKey: ['presentation', v.id] });
    },
  });
}

export function useDeletePresentation(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ id: string }>(`/api/presentations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presentations', courseId] }),
  });
}

export function useTogglePresentationShare(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiCall<PresentationShareState>(`/api/presentations/${id}/share`, {
        method: 'PATCH',
        body: { enabled },
      }),
    onSuccess: (_data, v) => {
      void qc.invalidateQueries({ queryKey: ['presentations', courseId] });
      void qc.invalidateQueries({ queryKey: ['presentation', v.id] });
    },
  });
}

// =================== Gamma presentations ===================
export function useGammaThemes() {
  return useQuery({
    queryKey: ['gamma', 'themes'],
    queryFn: () => apiCall<GammaTheme[]>('/api/gamma/themes'),
    staleTime: 60 * 60 * 1000,
  });
}

export function useCreateGammaPresentation(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateGammaPresentationInput) =>
      apiCall<CreateGammaPresentationResponse>(`/api/courses/${courseId}/presentations/gamma`, {
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presentations', courseId] }),
  });
}

export function useGammaJob(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['gamma', 'job', jobId],
    enabled: !!jobId && enabled,
    queryFn: () => apiCall<GammaGenerationJob>(`/api/gamma-jobs/${jobId}`),
    refetchInterval: (query) =>
      (query.state.data as GammaGenerationJob | undefined)?.status === 'pending' ? 5_000 : false,
  });
}

/**
 * Fetch in-flight Gamma jobs for a course so the presentations page can
 * resume polling them after navigation/refresh. Without this, a job that
 * was created in one session and never finished polling stays frozen at
 * `pending` because pollAndFinalize only runs when the GET endpoint is hit.
 */
export function useCourseGammaPendingJobs(courseId: string | null) {
  return useQuery({
    queryKey: ['gamma', 'pendingJobs', courseId],
    enabled: !!courseId,
    queryFn: () =>
      apiCall<{ jobs: GammaGenerationJob[] }>(`/api/courses/${courseId}/gamma-jobs/pending`),
  });
}

// Slides
export function useSlidesList(presentationId: string | null) {
  return useQuery({
    queryKey: ['slides', presentationId],
    enabled: !!presentationId,
    queryFn: () => apiCall<SlideSummary[]>(`/api/presentations/${presentationId}/slides`),
  });
}

export function useCreateSlide(presentationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSlideInput) =>
      apiCall<SlideSummary>(`/api/presentations/${presentationId}/slides`, { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slides', presentationId] }),
  });
}

export function useUpdateSlide(presentationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSlideInput }) =>
      apiCall<SlideSummary>(`/api/slides/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slides', presentationId] }),
  });
}

export function useDeleteSlide(presentationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiCall<{ id: string }>(`/api/slides/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slides', presentationId] }),
  });
}

export function useReorderSlides(presentationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderSlidesInput) =>
      apiCall<SlideSummary[]>(`/api/presentations/${presentationId}/slides/reorder`, {
        body: input,
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['slides', presentationId] });
      const prev = qc.getQueryData<SlideSummary[]>(['slides', presentationId]);
      if (prev) {
        const map = new Map(prev.map((s) => [s.id, s]));
        const optimistic: SlideSummary[] = input.ids
          .map((id, idx) => {
            const s = map.get(id);
            return s ? { ...s, position: idx } : null;
          })
          .filter((x): x is SlideSummary => x !== null);
        qc.setQueryData(['slides', presentationId], optimistic);
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(['slides', presentationId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['slides', presentationId] }),
  });
}

// =================== Assignments ===================
export function useAssignmentsList(courseId: string | null) {
  return useQuery({
    queryKey: ['assignments', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<AssignmentSummary[]>(`/api/courses/${courseId}/assignments`),
  });
}

export function useAssignment(assignmentId: string | null) {
  return useQuery({
    queryKey: ['assignment', assignmentId],
    enabled: !!assignmentId,
    queryFn: () => apiCall<AssignmentSummary>(`/api/assignments/${assignmentId}`),
  });
}

export function useCreateAssignment(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssignmentInput) =>
      apiCall<AssignmentSummary>(`/api/courses/${courseId}/assignments`, { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', courseId] }),
  });
}

export function useUpdateAssignment(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssignmentInput }) =>
      apiCall<AssignmentSummary>(`/api/assignments/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['assignments', courseId] });
      void qc.invalidateQueries({ queryKey: ['assignment', v.id] });
      // setId changes a set's membership (member counts) and the final-grade
      // roll-up, so refresh those views too.
      void qc.invalidateQueries({ queryKey: ['assignment-sets', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

export function useTransitionAssignment(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'publish' | 'close' | 'archive' | 'unarchive';
    }) => apiCall<AssignmentSummary>(`/api/assignments/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['assignments', courseId] });
      void qc.invalidateQueries({ queryKey: ['assignment', v.id] });
    },
  });
}

export function useDeleteAssignment(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ id: string }>(`/api/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', courseId] }),
  });
}

// Submissions
export function useAssignmentSubmissions(assignmentId: string | null) {
  return useQuery({
    queryKey: ['submissions', assignmentId],
    enabled: !!assignmentId,
    queryFn: () => apiCall<SubmissionWithStudent[]>(`/api/assignments/${assignmentId}/submissions`),
  });
}

export function useSubmission(submissionId: string | null) {
  return useQuery({
    queryKey: ['submission', submissionId],
    enabled: !!submissionId,
    queryFn: () => apiCall<SubmissionSummary>(`/api/submissions/${submissionId}`),
  });
}

export function useMySubmission(assignmentId: string | null) {
  return useQuery({
    queryKey: ['my-submission', assignmentId],
    enabled: !!assignmentId,
    queryFn: () =>
      apiCall<MyAssignmentSubmissionResponse>(`/api/assignments/${assignmentId}/submissions`, {
        method: 'POST',
      }),
    // 4xx (e.g. NOT_IN_GROUP for group-mode assignments where the student
    // hasn't joined a group) is deterministic — retrying just delays the
    // UI surfacing the warning panel and spams the API.
    retry: (_count, err) => !(err instanceof ApiClientError && err.status < 500),
  });
}

export function useAssignmentSubmissionsByGroup(assignmentId: string | null) {
  return useQuery({
    queryKey: ['submissions-grouped', assignmentId],
    enabled: !!assignmentId,
    queryFn: () =>
      apiCall<AssignmentSubmissionsByGroup>(
        `/api/assignments/${assignmentId}/submissions/grouped`,
      ),
  });
}

export function useUpdateSubmission(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSubmissionInput }) =>
      apiCall<SubmissionSummary>(`/api/submissions/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
    },
  });
}

export function useSubmitSubmission(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<SubmissionSummary>(`/api/submissions/${id}/submit`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
    },
  });
}

// Student-initiated unsubmit: revert a submitted, ungraded submission to draft
// so it can be edited and resubmitted (server enforces open-window + ungraded).
export function useUnsubmitSubmission(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<SubmissionSummary>(`/api/submissions/${id}/unsubmit`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
    },
  });
}

export function useAddSubmissionAttachment(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fileAssetId }: { id: string; fileAssetId: string }) =>
      apiCall<SubmissionAttachment[]>(`/api/submissions/${id}/attachments`, {
        method: 'POST',
        body: { fileAssetId },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['submissions-grouped', assignmentId] });
    },
  });
}

export function useRemoveSubmissionAttachment(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fileAssetId }: { id: string; fileAssetId: string }) =>
      apiCall<SubmissionAttachment[]>(`/api/submissions/${id}/attachments/${fileAssetId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['submissions-grouped', assignmentId] });
    },
  });
}

export function useGradeSubmission(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: GradeSubmissionInput }) =>
      apiCall<SubmissionSummary>(`/api/submissions/${id}/grade`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['submissions-grouped', assignmentId] });
    },
  });
}

export function useReturnSubmission(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReturnSubmissionInput }) =>
      apiCall<SubmissionSummary>(`/api/submissions/${id}/return`, { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      void qc.invalidateQueries({ queryKey: ['submissions-grouped', assignmentId] });
    },
  });
}

// =================== Discussions ===================
export function useDiscussionTopicsList(courseId: string | null) {
  return useQuery({
    queryKey: ['discussion-topics', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<DiscussionTopicSummary[]>(`/api/courses/${courseId}/discussion-topics`),
  });
}

export function useDiscussionTopic(topicId: string | null) {
  return useQuery({
    queryKey: ['discussion-topic', topicId],
    enabled: !!topicId,
    queryFn: () => apiCall<DiscussionTopicSummary>(`/api/discussion-topics/${topicId}`),
  });
}

export function useCreateDiscussionTopic(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDiscussionTopicInput) =>
      apiCall<DiscussionTopicSummary>(`/api/courses/${courseId}/discussion-topics`, {
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discussion-topics', courseId] }),
  });
}

export function useUpdateDiscussionTopic(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDiscussionTopicInput }) =>
      apiCall<DiscussionTopicSummary>(`/api/discussion-topics/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['discussion-topics', courseId] });
      void qc.invalidateQueries({ queryKey: ['discussion-topic', v.id] });
    },
  });
}

export function useTransitionDiscussionTopic(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'archive' | 'pin' | 'unpin' }) =>
      apiCall<DiscussionTopicSummary>(`/api/discussion-topics/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['discussion-topics', courseId] });
      void qc.invalidateQueries({ queryKey: ['discussion-topic', v.id] });
    },
  });
}

export function useDeleteDiscussionTopic(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ id: string }>(`/api/discussion-topics/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discussion-topics', courseId] }),
  });
}

export function useDiscussionPosts(topicId: string | null) {
  return useQuery({
    queryKey: ['discussion-posts', topicId],
    enabled: !!topicId,
    queryFn: () => apiCall<DiscussionPostSummary[]>(`/api/discussion-topics/${topicId}/posts`),
  });
}

export function useCreateDiscussionPost(topicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDiscussionPostInput) =>
      apiCall<DiscussionPostSummary>(`/api/discussion-topics/${topicId}/posts`, { body: input }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['discussion-posts', topicId] });
      const prev = qc.getQueryData<DiscussionPostSummary[]>(['discussion-posts', topicId]);
      const optimistic: DiscussionPostSummary = {
        id: `pending-${Date.now()}`,
        topicId,
        parentId: input.parentPostId ?? null,
        content: input.content,
        isDeleted: false,
        deletedAt: null,
        author: { id: 'me', name: '…', role: 'student' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (prev) qc.setQueryData(['discussion-posts', topicId], [...prev, optimistic]);
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(['discussion-posts', topicId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['discussion-posts', topicId] }),
  });
}

export function useReplyDiscussionPost(topicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, input }: { parentId: string; input: ReplyDiscussionPostInput }) =>
      apiCall<DiscussionPostSummary>(`/api/discussion-posts/${parentId}/replies`, { body: input }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['discussion-posts', topicId] }),
  });
}

export function useUpdateDiscussionPost(topicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDiscussionPostInput }) =>
      apiCall<DiscussionPostSummary>(`/api/discussion-posts/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discussion-posts', topicId] }),
  });
}

export function useDeleteDiscussionPost(topicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ id: string }>(`/api/discussion-posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discussion-posts', topicId] }),
  });
}

export function useDiscussionGrades(topicId: string | null) {
  return useQuery({
    queryKey: ['discussion-grades', topicId],
    enabled: !!topicId,
    queryFn: () => apiCall<DiscussionGradeRow[]>(`/api/discussion-topics/${topicId}/grades`),
  });
}

export function useGradeDiscussion(topicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, input }: { studentId: string; input: GradeDiscussionInput }) =>
      apiCall(`/api/discussion-topics/${topicId}/grades/${studentId}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discussion-grades', topicId] }),
  });
}

// =================== Quizzes ===================
export function useQuizzesList(courseId: string | null) {
  return useQuery({
    queryKey: ['quizzes', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<QuizSummary[]>(`/api/courses/${courseId}/quizzes`),
  });
}

export function useQuiz(quizId: string | null) {
  return useQuery({
    queryKey: ['quiz', quizId],
    enabled: !!quizId,
    queryFn: () => apiCall<QuizSummary>(`/api/quizzes/${quizId}`),
  });
}

export function useQuizQuestions(quizId: string | null) {
  return useQuery({
    queryKey: ['quiz-questions', quizId],
    enabled: !!quizId,
    queryFn: () =>
      apiCall<QuizQuestionTeacherView[] | QuizQuestionStudentView[]>(
        `/api/quizzes/${quizId}/questions`,
      ),
  });
}

export function useCreateQuiz(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuizInput) =>
      apiCall<QuizSummary>(`/api/courses/${courseId}/quizzes`, { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quizzes', courseId] }),
  });
}

export function useUpdateQuiz(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateQuizInput }) =>
      apiCall<QuizSummary>(`/api/quizzes/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['quizzes', courseId] });
      void qc.invalidateQueries({ queryKey: ['quiz', v.id] });
      // setId changes a quiz set's membership (member counts) and the
      // final-grade roll-up, so refresh those views too.
      void qc.invalidateQueries({ queryKey: ['quiz-sets', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

export function useQuizSchedules(quizId: string | null) {
  return useQuery({
    queryKey: ['quiz-schedules', quizId],
    enabled: !!quizId,
    queryFn: () => apiCall<QuizScheduleListResponse>(`/api/quizzes/${quizId}/schedules`),
  });
}

export function useCreateQuizSchedule(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuizScheduleInput) =>
      apiCall<QuizScheduleSummary>(`/api/quizzes/${quizId}/schedules`, { body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quiz-schedules', quizId] });
      void qc.invalidateQueries({ queryKey: ['quiz', quizId] });
    },
  });
}

export function useUpdateQuizSchedule(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, input }: { scheduleId: string; input: UpdateQuizScheduleInput }) =>
      apiCall<QuizScheduleSummary>(`/api/quizzes/${quizId}/schedules/${scheduleId}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz-schedules', quizId] }),
  });
}

export function useDeleteQuizSchedule(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) =>
      apiCall<{ id: string }>(`/api/quizzes/${quizId}/schedules/${scheduleId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quiz-schedules', quizId] });
      void qc.invalidateQueries({ queryKey: ['quiz', quizId] });
    },
  });
}

export function useSetScheduleMembers(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scheduleId,
      input,
    }: {
      scheduleId: string;
      input: SetScheduleMembersInput;
    }) =>
      apiCall<QuizScheduleWithMembers>(
        `/api/quizzes/${quizId}/schedules/${scheduleId}/members`,
        { method: 'PUT', body: input },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz-schedules', quizId] }),
  });
}

export function useTransitionQuiz(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'publish' | 'close' | 'archive' | 'unarchive';
    }) => apiCall<QuizSummary>(`/api/quizzes/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['quizzes', courseId] });
      void qc.invalidateQueries({ queryKey: ['quiz', v.id] });
    },
  });
}

export function useDeleteQuiz(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiCall<{ id: string }>(`/api/quizzes/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quizzes', courseId] }),
  });
}

export function useCreateQuizQuestion(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuizQuestionInput) =>
      apiCall<QuizQuestionTeacherView>(`/api/quizzes/${quizId}/questions`, { body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quiz-questions', quizId] });
      void qc.invalidateQueries({ queryKey: ['quiz', quizId] });
    },
  });
}

export function useUpdateQuizQuestion(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateQuizQuestionInput }) =>
      apiCall<QuizQuestionTeacherView>(`/api/quiz-questions/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quiz-questions', quizId] });
      void qc.invalidateQueries({ queryKey: ['quiz', quizId] });
    },
  });
}

export function useDeleteQuizQuestion(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ id: string }>(`/api/quiz-questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quiz-questions', quizId] });
      void qc.invalidateQueries({ queryKey: ['quiz', quizId] });
    },
  });
}

export function useReorderQuizQuestions(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderQuizQuestionsInput) =>
      apiCall<QuizQuestionTeacherView[]>(`/api/quizzes/${quizId}/questions/reorder`, {
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz-questions', quizId] }),
  });
}

// Quiz attempts
export function useStartQuizAttempt(quizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<QuizAttemptDetail>(`/api/quizzes/${quizId}/attempts`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-quiz-attempts', quizId] }),
  });
}

export function useQuizAttempt(attemptId: string | null) {
  return useQuery({
    queryKey: ['quiz-attempt', attemptId],
    enabled: !!attemptId,
    queryFn: () => apiCall<QuizAttemptDetail>(`/api/quiz-attempts/${attemptId}`),
  });
}

export function useSaveQuizAttemptAnswers(attemptId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveQuizAttemptAnswersInput) =>
      apiCall<QuizAttemptDetail>(`/api/quiz-attempts/${attemptId}/answers`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz-attempt', attemptId] }),
  });
}

export function useSubmitQuizAttempt(attemptId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitQuizAttemptInput) =>
      apiCall<QuizAttemptDetail>(`/api/quiz-attempts/${attemptId}/submit`, { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz-attempt', attemptId] }),
  });
}

export function useQuizAttempts(quizId: string | null) {
  return useQuery({
    queryKey: ['quiz-attempts', quizId],
    enabled: !!quizId,
    queryFn: () => apiCall<QuizAttemptWithStudent[]>(`/api/quizzes/${quizId}/attempts`),
  });
}

export function useMyQuizAttempts(quizId: string | null) {
  return useQuery({
    queryKey: ['my-quiz-attempts', quizId],
    enabled: !!quizId,
    queryFn: () => apiCall<QuizAttemptSummary[]>(`/api/me/quizzes/${quizId}/attempts`),
  });
}

export function useGradeQuizAnswer(attemptId: string, quizId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: GradeQuizAnswerInput }) =>
      apiCall(`/api/quiz-answers/${id}/grade`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quiz-attempt', attemptId] });
      if (quizId) void qc.invalidateQueries({ queryKey: ['quiz-attempts', quizId] });
    },
  });
}

// =================== Attendance ===================
export function useAttendanceSessions(courseId: string | null) {
  return useQuery({
    queryKey: ['attendance-sessions', courseId],
    enabled: !!courseId,
    queryFn: () =>
      apiCall<AttendanceSessionSummary[]>(`/api/courses/${courseId}/attendance-sessions`),
  });
}

export function useAttendanceSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['attendance-session', sessionId],
    enabled: !!sessionId,
    queryFn: () => apiCall<AttendanceSessionSummary>(`/api/attendance-sessions/${sessionId}`),
  });
}

export function useAttendanceRecords(sessionId: string | null) {
  return useQuery({
    queryKey: ['attendance-records', sessionId],
    enabled: !!sessionId,
    queryFn: () => apiCall<AttendanceRecordRow[]>(`/api/attendance-sessions/${sessionId}/records`),
  });
}

export function useCreateAttendanceSession(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAttendanceSessionInput) =>
      apiCall<AttendanceSessionSummary>(`/api/courses/${courseId}/attendance-sessions`, {
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-sessions', courseId] }),
  });
}

export function useUpdateAttendanceSession(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAttendanceSessionInput }) =>
      apiCall<AttendanceSessionSummary>(`/api/attendance-sessions/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-sessions', courseId] }),
  });
}

export function useBulkMarkAttendance(sessionId: string, courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkMarkAttendanceInput) =>
      apiCall<AttendanceRecordRow[]>(`/api/attendance-sessions/${sessionId}/records`, {
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['attendance-records', sessionId] });
      void qc.invalidateQueries({ queryKey: ['attendance-sessions', courseId] });
    },
  });
}

export function useDeleteAttendanceSession(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ id: string }>(`/api/attendance-sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-sessions', courseId] }),
  });
}

export function useCloseAttendanceSession(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<AttendanceSessionSummary>(`/api/attendance-sessions/${id}/close`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-sessions', courseId] }),
  });
}

export function useMyAttendance(courseId: string | null) {
  return useQuery({
    queryKey: ['my-attendance', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<StudentAttendanceRow[]>(`/api/me/courses/${courseId}/attendance`),
  });
}

export function useTodayAttendanceSession(courseId: string | null) {
  return useQuery({
    queryKey: ['attendance-today', courseId],
    enabled: !!courseId,
    queryFn: () =>
      apiCall<TodayAttendanceSession | null>(
        `/api/me/courses/${courseId}/attendance-sessions/today`,
      ),
  });
}

export function useSignAttendance(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiCall<{ ok: true; ipAddress: string | null; status: AttendanceStatus }>(
        `/api/me/attendance-sessions/${sessionId}/sign`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['attendance-today', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-attendance', courseId] });
    },
  });
}

async function downloadCsv(path: string, filename: string): Promise<void> {
  const stored = (() => {
    try {
      const raw = localStorage.getItem('coursewise.accessToken');
      return raw ?? '';
    } catch {
      return '';
    }
  })();
  const res = await fetch(path, {
    headers: stored ? { authorization: `Bearer ${stored}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const text = await res.text();
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadAttendanceCsv(courseId: string): Promise<void> {
  await downloadCsv(`/api/courses/${courseId}/attendance/export.csv`, `attendance-${courseId}.csv`);
}

export async function downloadGradesCsv(courseId: string): Promise<void> {
  await downloadCsv(`/api/courses/${courseId}/grades/export.csv`, `grades-${courseId}.csv`);
}

// ---------- Course export (async ZIP → emailed link) ----------
export function useCourseExports(courseId: string | null) {
  return useQuery({
    queryKey: ['course-exports', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<CourseExportJob[]>(`/api/courses/${courseId}/exports`),
    // Poll while any job is still building so the status flips to Done on its own.
    refetchInterval: (q) => {
      const data = q.state.data as CourseExportJob[] | undefined;
      return data?.some((j) => j.status === 'pending' || j.status === 'running') ? 4000 : false;
    },
  });
}

export function useCreateCourseExport(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<{ jobId: string; status: string }>(`/api/courses/${courseId}/exports`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['course-exports', courseId] });
    },
  });
}

/** Fetch a fresh authenticated download URL for a finished export and start the download. */
export async function downloadCourseExport(courseId: string, jobId: string): Promise<void> {
  const { downloadUrl } = await apiCall<{ downloadUrl: string }>(
    `/api/courses/${courseId}/exports/${jobId}/download-url`,
  );
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- M5: Grading policy ----------
export function useGradingPolicy(courseId: string | null) {
  return useQuery({
    queryKey: ['grading-policy', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<GradingPolicySummary>(`/api/courses/${courseId}/grading-policy`),
  });
}

export function useUpdateGradingPolicy(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGradingPolicyInput) =>
      apiCall<GradingPolicySummary>(`/api/courses/${courseId}/grading-policy`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['grading-policy', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
    },
  });
}

// ---------- M5: Final grades ----------
export function useFinalGrades(courseId: string | null) {
  return useQuery({
    queryKey: ['final-grades', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<FinalGradeSummary[]>(`/api/courses/${courseId}/final-grades`),
  });
}

export function useRecalculateFinalGrades(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<RecalculateFinalGradesResult>(`/api/courses/${courseId}/final-grades/recalculate`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
    },
  });
}

export function useOverrideFinalGrade(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OverrideFinalGradeInput }) =>
      apiCall<FinalGradeSummary>(`/api/final-grades/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
    },
  });
}

export function useGradebookStudentDetail(
  courseId: string | null,
  studentId: string | null,
) {
  return useQuery({
    queryKey: ['gradebook-student-detail', courseId, studentId],
    enabled: !!courseId && !!studentId,
    queryFn: () =>
      apiCall<GradebookStudentDetail>(
        `/api/courses/${courseId}/students/${studentId}/gradebook-detail`,
      ),
  });
}

export function useMyFinalGrade(courseId: string | null) {
  return useQuery({
    queryKey: ['my-final-grade', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<FinalGradeSummary | null>(`/api/me/courses/${courseId}/final-grade`),
  });
}

// Self-scoped itemized gradebook: the calling student's full per-item
// breakdown (assignments, quizzes, discussions, attendance). Backed by
// GET /api/me/courses/:courseId/gradebook-detail, which only ever returns the
// caller's own records.
export function useMyGradebookDetail(courseId: string | null) {
  return useQuery({
    queryKey: ['my-gradebook-detail', courseId],
    enabled: !!courseId,
    queryFn: () =>
      apiCall<GradebookStudentDetail>(`/api/me/courses/${courseId}/gradebook-detail`),
  });
}

// ---------- Assignment groups ----------
export function useAssignmentGroups(courseId: string | undefined) {
  return useQuery({
    queryKey: ['assignment-groups', courseId],
    enabled: !!courseId,
    queryFn: () =>
      apiCall<AssignmentGroup[]>(`/api/courses/${courseId}/assignment-groups`),
  });
}

export function useCreateAssignmentGroup(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; weight: number; position?: number }) =>
      apiCall<AssignmentGroup>(`/api/courses/${courseId}/assignment-groups`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignment-groups', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

export function useUpdateAssignmentGroup(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      ...patch
    }: {
      groupId: string;
      name?: string;
      weight?: number;
      position?: number;
    }) =>
      apiCall<AssignmentGroup>(
        `/api/courses/${courseId}/assignment-groups/${groupId}`,
        { method: 'PATCH', body: patch },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignment-groups', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

export function useDeleteAssignmentGroup(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      apiCall<{ id: string; orphanedItemCount: number }>(
        `/api/courses/${courseId}/assignment-groups/${groupId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignment-groups', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

export function useReorderAssignmentGroups(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // 204 No Content on success — bypass the JSON-envelope parser and
      // check the status code directly, mirroring useRetryR2Cleanup.
      const res = await apiCall<Response>(
        `/api/courses/${courseId}/assignment-groups/reorder`,
        { method: 'POST', body: { orderedIds }, raw: true },
      );
      if (!res.ok) {
        const text = await res.text();
        let err: ApiError = {
          code: 'UNKNOWN',
          message: res.statusText,
          i18nKey: 'errors.internal',
        };
        try {
          const parsed = text ? (JSON.parse(text) as ApiResponse<unknown>) : undefined;
          if (parsed && parsed.success === false) err = parsed.error;
        } catch {
          /* fall through with default err */
        }
        throw new ApiClientError(res.status, err);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignment-groups', courseId] });
    },
  });
}

// ---------- Assignment sets (avg / best-of bundles) ----------
export function useAssignmentSets(courseId: string | undefined) {
  return useQuery({
    queryKey: ['assignment-sets', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<AssignmentSet[]>(`/api/courses/${courseId}/assignment-sets`),
  });
}

export function useCreateAssignmentSet(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      groupId?: string | null;
      scoringRule?: AssignmentSetRule;
      position?: number;
    }) =>
      apiCall<AssignmentSet>(`/api/courses/${courseId}/assignment-sets`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignment-sets', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

export function useUpdateAssignmentSet(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      setId,
      ...patch
    }: {
      setId: string;
      name?: string;
      groupId?: string | null;
      scoringRule?: AssignmentSetRule;
      position?: number;
    }) =>
      apiCall<AssignmentSet>(`/api/courses/${courseId}/assignment-sets/${setId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignment-sets', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

export function useDeleteAssignmentSet(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) =>
      apiCall<{ id: string; orphanedItemCount: number }>(
        `/api/courses/${courseId}/assignment-sets/${setId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignment-sets', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

// ---------- Quiz sets (avg / best-of bundles of quizzes) ----------

export function useQuizSets(courseId: string | undefined) {
  return useQuery({
    queryKey: ['quiz-sets', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<QuizSet[]>(`/api/courses/${courseId}/quiz-sets`),
  });
}

export function useCreateQuizSet(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      groupId?: string | null;
      scoringRule?: QuizSetRule;
      position?: number;
    }) =>
      apiCall<QuizSet>(`/api/courses/${courseId}/quiz-sets`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quiz-sets', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

export function useUpdateQuizSet(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      setId,
      ...patch
    }: {
      setId: string;
      name?: string;
      groupId?: string | null;
      scoringRule?: QuizSetRule;
      position?: number;
    }) =>
      apiCall<QuizSet>(`/api/courses/${courseId}/quiz-sets/${setId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quiz-sets', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

export function useDeleteQuizSet(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) =>
      apiCall<{ id: string; orphanedItemCount: number }>(
        `/api/courses/${courseId}/quiz-sets/${setId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quiz-sets', courseId] });
      void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-final-grade', courseId] });
    },
  });
}

// ---------- Student groups (Canvas-style group sets) ----------

export function useCourseStudents(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course-students', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<EnrollmentRow[]>(`/api/courses/${courseId}/students`),
  });
}

export function useGroupSets(courseId: string | undefined) {
  return useQuery({
    queryKey: ['group-sets', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<GroupSetSummary[]>(`/api/courses/${courseId}/group-sets`),
  });
}

export function useGroupSet(courseId: string | undefined, setId: string | undefined) {
  return useQuery({
    queryKey: ['group-set', courseId, setId],
    enabled: !!courseId && !!setId,
    queryFn: () =>
      apiCall<GroupSetWithGroups>(`/api/courses/${courseId}/group-sets/${setId}`),
  });
}

export function useCreateGroupSet(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupSetInput) =>
      apiCall<GroupSetSummary>(`/api/courses/${courseId}/group-sets`, { body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['group-sets', courseId] });
    },
  });
}

export function useUpdateGroupSet(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ setId, patch }: { setId: string; patch: UpdateGroupSetInput }) =>
      apiCall(`/api/courses/${courseId}/group-sets/${setId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['group-sets', courseId] });
      void qc.invalidateQueries({ queryKey: ['group-set', courseId, vars.setId] });
    },
  });
}

export function useDeleteGroupSet(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) =>
      apiCall<{ id: string }>(`/api/courses/${courseId}/group-sets/${setId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['group-sets', courseId] });
    },
  });
}

export function useUpdateGroup(courseId: string, setId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, patch }: { groupId: string; patch: UpdateGroupInput }) =>
      apiCall(`/api/courses/${courseId}/group-sets/${setId}/groups/${groupId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['group-set', courseId, setId] });
    },
  });
}

/**
 * Student self-joins (no body) OR teacher assigns a student (body =
 * { studentId }). Server branches on the caller's role.
 */
export function useJoinOrAssignGroupMember(courseId: string, setId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      studentId,
      force,
    }: {
      groupId: string;
      studentId?: string;
      /** Teacher/admin only. When true and the group is at/over its
       *  effective cap, the server bumps maxMembersOverride and admits
       *  the student. Ignored when the caller is a student. */
      force?: boolean;
    }) => {
      const body: AssignGroupMemberInput | undefined = studentId
        ? { studentId, ...(force ? { force: true } : {}) }
        : undefined;
      return apiCall(
        `/api/courses/${courseId}/group-sets/${setId}/groups/${groupId}/members`,
        body ? { method: 'POST', body } : { method: 'POST' },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['group-set', courseId, setId] });
      void qc.invalidateQueries({ queryKey: ['group-sets', courseId] });
    },
  });
}

export function useRemoveGroupMember(courseId: string, setId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, studentId }: { groupId: string; studentId: string }) => {
      const res = await apiCall<Response>(
        `/api/courses/${courseId}/group-sets/${setId}/groups/${groupId}/members/${studentId}`,
        { method: 'DELETE', raw: true },
      );
      if (!res.ok) {
        const text = await res.text();
        let err: ApiError = {
          code: 'UNKNOWN',
          message: res.statusText,
          i18nKey: 'errors.internal',
        };
        try {
          const parsed = text ? (JSON.parse(text) as ApiResponse<unknown>) : undefined;
          if (parsed && parsed.success === false) err = parsed.error;
        } catch {
          /* noop */
        }
        throw new ApiClientError(res.status, err);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['group-set', courseId, setId] });
      void qc.invalidateQueries({ queryKey: ['group-sets', courseId] });
    },
  });
}

// ---------- M5: Alerts ----------
export function useAdminAlerts(status: AlertStatus) {
  return useQuery({
    queryKey: ['admin-alerts', status],
    queryFn: () => apiCall<AlertWithContext[]>(`/api/alerts?status=${status}`),
    // Keep the previous tab's list on screen while the next loads.
    placeholderData: (prev) => prev,
  });
}

export function useCourseAlerts(courseId: string | null, status?: AlertStatus) {
  return useQuery({
    queryKey: ['course-alerts', courseId, status ?? 'all'],
    enabled: !!courseId,
    queryFn: () => {
      const qs = status ? `?status=${status}` : '';
      return apiCall<AlertWithStudent[]>(`/api/courses/${courseId}/alerts${qs}`);
    },
  });
}

export function useGenerateAlerts(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<GenerateAlertsResult>(`/api/courses/${courseId}/alerts/generate`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['course-alerts', courseId] });
      void qc.invalidateQueries({ queryKey: ['my-alerts'] });
    },
  });
}

export function useCreateAlert(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateManualAlertInput) =>
      apiCall<AlertSummary>(`/api/courses/${courseId}/alerts`, { body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['course-alerts', courseId] });
    },
  });
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolveAlertInput }) =>
      apiCall<AlertSummary>(`/api/alerts/${id}/resolve`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['course-alerts'] });
      void qc.invalidateQueries({ queryKey: ['my-alerts'] });
      void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
  });
}

export function useMyAlerts(status?: AlertStatus) {
  return useQuery({
    queryKey: ['my-alerts', status ?? 'all'],
    queryFn: () => {
      const qs = status ? `?status=${status}` : '';
      return apiCall<AlertSummary[]>(`/api/me/alerts${qs}`);
    },
  });
}

// ---------- M5: Dashboards ----------
export function useAdminDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => apiCall<AdminDashboardResponse>('/api/dashboards/admin'),
  });
}

export function useAdminActivity(days: number) {
  return useQuery({
    queryKey: ['admin-activity', days],
    queryFn: () => apiCall<AdminActivityResponse>(`/api/dashboards/admin/activity?days=${days}`),
    // Keep the previous range's chart on screen while the new one loads.
    placeholderData: (prev) => prev,
  });
}

export function useTeacherDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'teacher'],
    queryFn: () => apiCall<TeacherDashboardResponse>('/api/dashboards/teacher'),
  });
}

export function useStudentDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'student'],
    queryFn: () => apiCall<StudentDashboardResponse>('/api/dashboards/student'),
  });
}

// ---------- AI: admin providers & models ----------
export function useAiProviders() {
  return useQuery({
    queryKey: ['ai', 'providers'],
    queryFn: async () => {
      const res = await apiCall<{ providers: AiProviderSummary[] }>('/api/admin/ai/providers');
      return res.providers;
    },
  });
}

export function useCreateAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAiProviderInput) =>
      apiCall<AiProviderSummary>('/api/admin/ai/providers', { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'providers'] }),
  });
}

export function useUpdateAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAiProviderInput }) =>
      apiCall<AiProviderSummary>(`/api/admin/ai/providers/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'providers'] });
      void qc.invalidateQueries({ queryKey: ['ai', 'models'] });
    },
  });
}

export function useDeleteAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ id: string }>(`/api/admin/ai/providers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'providers'] });
      void qc.invalidateQueries({ queryKey: ['ai', 'models'] });
    },
  });
}

export function useAiModels() {
  return useQuery({
    queryKey: ['ai', 'models'],
    queryFn: async () => {
      const res = await apiCall<{ models: AiModelSummary[] }>('/api/admin/ai/models');
      return res.models;
    },
  });
}

export function useCreateAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAiModelInput) =>
      apiCall<AiModelSummary>('/api/admin/ai/models', { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'models'] }),
  });
}

export function useUpdateAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAiModelInput }) =>
      apiCall<AiModelSummary>(`/api/admin/ai/models/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'models'] }),
  });
}

export function useDeleteAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<{ id: string }>(`/api/admin/ai/models/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'models'] }),
  });
}

export function useAiPromptTemplates() {
  return useQuery({
    queryKey: ['ai', 'prompts'],
    queryFn: async () => {
      const res = await apiCall<{ templates: AiPromptTemplate[] }>('/api/admin/ai/prompts');
      return res.templates;
    },
  });
}

export function useUpdateAiPromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, input }: { kind: AiArtifactKind; input: UpdateAiPromptTemplateInput }) =>
      apiCall<AiPromptTemplate>(`/api/admin/ai/prompts/${kind}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'prompts'] });
    },
  });
}

export function useResetAiPromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: AiArtifactKind) =>
      apiCall<AiPromptTemplate>(`/api/admin/ai/prompts/${kind}/reset`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'prompts'] });
    },
  });
}

// ---------- AI: teacher course-scoped generation ----------
export function useCourseAiModels(courseId: string | null) {
  return useQuery({
    queryKey: ['ai', 'course-models', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const res = await apiCall<{ models: AiModelOption[] }>(`/api/courses/${courseId}/ai/models`);
      return res.models;
    },
  });
}

export function useGenerateMaterials(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateMaterialsInput) =>
      apiCall<{ jobId: string }>(`/api/courses/${courseId}/ai/generate`, { body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'jobs', courseId] });
    },
  });
}

export function useCourseAiJobs(courseId: string | null) {
  return useQuery({
    queryKey: ['ai', 'jobs', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const res = await apiCall<{ jobs: AiJobSummary[] }>(`/api/courses/${courseId}/ai/jobs`);
      return res.jobs;
    },
    // Poll while any job is queued or running so the history card reflects
    // progress without a manual refresh.
    refetchInterval: (query) => {
      const jobs = (query.state.data as AiJobSummary[] | undefined) ?? [];
      const inFlight = jobs.some((j) => j.status === 'queued' || j.status === 'running');
      return inFlight ? 3000 : false;
    },
  });
}

export function useCourseAiJob(courseId: string | null, jobId: string | null) {
  return useQuery({
    queryKey: ['ai', 'job', courseId, jobId],
    enabled: !!courseId && !!jobId,
    queryFn: () => apiCall<AiJobDetail>(`/api/courses/${courseId}/ai/jobs/${jobId}`),
    refetchInterval: (query) => {
      const job = query.state.data as AiJobDetail | undefined;
      if (!job) return false;
      return job.status === 'queued' || job.status === 'running' ? 2000 : false;
    },
  });
}

// ---------- Messaging ----------

export function useMessageThreads(courseId: string | null | undefined) {
  return useQuery({
    queryKey: ['messages', 'threads', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const res = await apiCall<{ threads: MessageThreadSummary[] }>(
        `/api/courses/${courseId}/messages/threads`,
      );
      return res.threads;
    },
    refetchInterval: 15_000,
  });
}

export function useMessageThread(courseId: string | null | undefined, threadId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['messages', 'thread', courseId, threadId],
    enabled: !!courseId && !!threadId,
    queryFn: async () => {
      const detail = await apiCall<MessageThreadDetail>(
        `/api/courses/${courseId}/messages/threads/${threadId}`,
      );
      // The GET marks unread-as-read server-side, so refresh the list +
      // unread-count once detail returns.
      void qc.invalidateQueries({ queryKey: ['messages', 'threads', courseId] });
      void qc.invalidateQueries({ queryKey: ['messages', 'unread-count'] });
      return detail;
    },
    refetchInterval: 15_000,
  });
}

export function useSendMessage(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      apiCall<{ threadId: string; message: MessageRecord }>(
        `/api/courses/${courseId}/messages`,
        { body: input },
      ),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['messages', 'threads', courseId] });
      void qc.invalidateQueries({ queryKey: ['messages', 'thread', courseId, data.threadId] });
      void qc.invalidateQueries({ queryKey: ['messages', 'unread-count'] });
    },
  });
}

export function useDeleteMessageThread(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      apiCall<{ id: string }>(`/api/courses/${courseId}/messages/threads/${threadId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messages', 'threads', courseId] });
      void qc.invalidateQueries({ queryKey: ['messages', 'unread-count'] });
    },
  });
}

export function useMessageUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ['messages', 'unread-count'],
    enabled,
    queryFn: () => apiCall<UnreadCountResponse>('/api/messages/unread-count'),
    refetchInterval: 60_000,
  });
}

// ---------- Student profile (Modify dialog) ----------

export function useStudentProfile(userId: string | null) {
  return useQuery({
    queryKey: ['student-profile', userId],
    enabled: !!userId,
    queryFn: () => apiCall<StudentProfileDetail>(`/api/students/${userId}/profile`),
  });
}

export function useUpdateStudentProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateStudentProfileInput }) =>
      apiCall<StudentProfileDetail>(`/api/students/${userId}/profile`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['student-profile', vars.userId] });
      // Roster queries surface name + studentNumber; refresh so the row
      // updates without a manual reload.
      void qc.invalidateQueries({ queryKey: ['course-students'] });
    },
  });
}

export function useDeleteStudentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string | null }) =>
      apiCall<DeleteStudentAccountResponse>(`/api/students/${userId}`, {
        method: 'DELETE',
        // validateJson on the API requires a JSON body even when all
        // fields are optional, so always send {} at minimum.
        body: { reason: reason ?? null },
      }),
    onSuccess: (_data, vars) => {
      void qc.removeQueries({ queryKey: ['student-profile', vars.userId] });
      void qc.invalidateQueries({ queryKey: ['course-students'] });
    },
  });
}

// Password reset flows. These are unauthenticated/self-service auth mutations
// with no cached data to invalidate, so no useQueryClient is needed.
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiCall<{ requested: boolean }>('/api/auth/forgot-password', {
        body: { email },
        auth: false,
      }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      apiCall<{ reset: boolean }>('/api/auth/reset-password', {
        body: input,
        auth: false,
      }),
  });
}

export function useSendStudentResetLink() {
  return useMutation({
    mutationFn: (userId: string) =>
      apiCall<SendResetLinkResponse>(`/api/students/${userId}/reset-password-link`, {
        method: 'POST',
      }),
  });
}
