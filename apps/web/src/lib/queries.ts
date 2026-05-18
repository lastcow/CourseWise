import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignmentSummary,
  CourseDetail,
  CourseSummary,
  CreateAssignmentInput,
  CreateCourseInput,
  CreateDiscussionPostInput,
  CreateDiscussionTopicInput,
  CreateInvitationCodeInput,
  CreateMaterialInput,
  CreateModuleInput,
  CreatePresentationInput,
  CreateSlideInput,
  DiscussionGradeRow,
  DiscussionPostSummary,
  DiscussionTopicSummary,
  GradeDiscussionInput,
  GradeSubmissionInput,
  InvitationCodeSummary,
  MaterialSummary,
  ModuleSummary,
  PresentationSummary,
  ReorderModulesInput,
  ReorderSlidesInput,
  ReplyDiscussionPostInput,
  ReturnSubmissionInput,
  SlideSummary,
  SubmissionSummary,
  SubmissionWithStudent,
  UpdateAssignmentInput,
  UpdateCourseInput,
  UpdateDiscussionPostInput,
  UpdateDiscussionTopicInput,
  UpdateMaterialInput,
  UpdateModuleInput,
  UpdatePresentationInput,
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
    mutationFn: (input: CreateCourseInput) => apiCall<CourseSummary>('/api/courses', { body: input }),
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
      apiCall<CourseSummary>(`/api/courses/${id}/${activate ? 'activate' : 'archive'}`, { method: 'POST' }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', courseId] }),
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
    mutationFn: (id: string) => apiCall<{ id: string }>(`/api/materials/${id}`, { method: 'DELETE' }),
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
  return apiCall<ValidateInvitationCodeResponse>('/api/invitation-codes/validate', {
    method: 'POST',
    body: { code },
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
    mutationFn: (id: string) => apiCall<{ id: string }>(`/api/presentations/${id}`, { method: 'DELETE' }),
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
      apiCall<SlideSummary[]>(`/api/presentations/${presentationId}/slides/reorder`, { body: input }),
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
    mutationFn: (id: string) => apiCall<{ id: string }>(`/api/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', courseId] }),
  });
}

// Submissions
export function useAssignmentSubmissions(assignmentId: string | null) {
  return useQuery({
    queryKey: ['submissions', assignmentId],
    enabled: !!assignmentId,
    queryFn: () =>
      apiCall<SubmissionWithStudent[]>(`/api/assignments/${assignmentId}/submissions`),
  });
}

export function useMySubmission(assignmentId: string | null) {
  return useQuery({
    queryKey: ['my-submission', assignmentId],
    enabled: !!assignmentId,
    queryFn: () =>
      apiCall<SubmissionSummary>(`/api/assignments/${assignmentId}/submissions`, { method: 'POST' }),
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
      apiCall<DiscussionTopicSummary>(`/api/courses/${courseId}/discussion-topics`, { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discussion-topics', courseId] }),
  });
}

export function useUpdateDiscussionTopic(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDiscussionTopicInput }) =>
      apiCall<DiscussionTopicSummary>(`/api/discussion-topics/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['discussion-topics', courseId] });
      void qc.invalidateQueries({ queryKey: ['discussion-topic', v.id] });
    },
  });
}

export function useTransitionDiscussionTopic(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'publish' | 'archive' | 'pin' | 'unpin';
    }) =>
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
      apiCall<DiscussionPostSummary>(`/api/discussion-posts/${id}`, { method: 'PATCH', body: input }),
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
