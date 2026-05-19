import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminDashboardResponse,
  AiArtifactKind,
  AiModelSummary,
  AiPromptTemplate,
  AiProviderSummary,
  AlertStatus,
  AlertSummary,
  AlertWithStudent,
  AiJobDetail,
  AiJobSummary,
  AiModelOption,
  ApiTokenSummary,
  AssignmentSummary,
  AttendanceRecordRow,
  AttendanceSessionSummary,
  BulkMarkAttendanceInput,
  CourseDetail,
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
  CreateSelfApiTokenInput,
  CreateSlideInput,
  DiscussionGradeRow,
  DiscussionPostSummary,
  DiscussionTopicSummary,
  FinalGradeSummary,
  GenerateAlertsResult,
  GenerateMaterialsInput,
  GradeDiscussionInput,
  GradeQuizAnswerInput,
  GradeSubmissionInput,
  GradingPolicySummary,
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
  PresentationSummary,
  QuizAttemptDetail,
  QuizAttemptSummary,
  QuizAttemptWithStudent,
  QuizQuestionStudentView,
  QuizQuestionTeacherView,
  QuizSummary,
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
  StudentDashboardResponse,
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
  UploadUrlRequest,
  UploadUrlResponse,
  ValidateInvitationCodeResponse,
} from '@coursewise/shared';
import { apiCall } from './api';

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

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiCall<{ id: string }>(`/api/courses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['courses'] });
    },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitation-codes'] }),
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

// ---------- Self-serve API tokens (Settings → API Tokens) ----------
export function useMyApiTokens() {
  return useQuery({
    queryKey: ['my-api-tokens'],
    queryFn: () => apiCall<{ tokens: ApiTokenSummary[] }>('/api/me/api-tokens'),
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
export function requestUploadUrl(input: UploadUrlRequest) {
  return apiCall<UploadUrlResponse>('/api/files/upload-url', { body: input });
}

export function completeUpload(fileAssetId: string) {
  return apiCall<{ id: string; status: string }>('/api/files/complete-upload', {
    body: { fileAssetId },
  });
}

export function getDownloadUrl(fileId: string) {
  return apiCall<{ downloadUrl: string; fileName: string | null }>(
    `/api/files/${fileId}/download-url`,
  );
}

export async function uploadFile(
  file: File,
  courseId: string,
  relatedType: 'material' | 'assignment' | 'submission' = 'material',
  onProgress?: (pct: number) => void,
) {
  const presign = await requestUploadUrl({
    courseId,
    fileName: file.name,
    mimeType: file.type as UploadUrlRequest['mimeType'],
    fileSize: file.size,
    relatedType,
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presign.uploadUrl);
    Object.entries(presign.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(file);
  });

  await completeUpload(presign.fileAssetId);
  return { fileAssetId: presign.fileAssetId, r2Key: presign.r2Key };
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
    },
  });
}

export function useTransitionAssignment(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'close' | 'archive' }) =>
      apiCall<AssignmentSummary>(`/api/assignments/${id}/${action}`, { method: 'POST' }),
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

export function useMySubmission(assignmentId: string | null) {
  return useQuery({
    queryKey: ['my-submission', assignmentId],
    enabled: !!assignmentId,
    queryFn: () =>
      apiCall<SubmissionSummary>(`/api/assignments/${assignmentId}/submissions`, {
        method: 'POST',
      }),
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

export function useGradeSubmission(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: GradeSubmissionInput }) =>
      apiCall<SubmissionSummary>(`/api/submissions/${id}/grade`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submissions', assignmentId] }),
  });
}

export function useReturnSubmission(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReturnSubmissionInput }) =>
      apiCall<SubmissionSummary>(`/api/submissions/${id}/return`, { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submissions', assignmentId] }),
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
    },
  });
}

export function useTransitionQuiz(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'close' | 'archive' }) =>
      apiCall<QuizSummary>(`/api/quizzes/${id}/${action}`, { method: 'POST' }),
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

export function useMyFinalGrade(courseId: string | null) {
  return useQuery({
    queryKey: ['my-final-grade', courseId],
    enabled: !!courseId,
    queryFn: () => apiCall<FinalGradeSummary | null>(`/api/me/courses/${courseId}/final-grade`),
  });
}

// ---------- M5: Alerts ----------
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
      const res = await apiCall<{ models: AiModelOption[] }>(
        `/api/courses/${courseId}/ai/models`,
      );
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
