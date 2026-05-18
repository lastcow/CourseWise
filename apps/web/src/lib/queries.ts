import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CourseDetail,
  CourseSummary,
  CreateCourseInput,
  CreateInvitationCodeInput,
  CreateMaterialInput,
  CreateModuleInput,
  InvitationCodeSummary,
  MaterialSummary,
  ModuleSummary,
  ReorderModulesInput,
  UpdateCourseInput,
  UpdateMaterialInput,
  UpdateModuleInput,
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

export async function uploadFile(file: File, courseId: string, onProgress?: (pct: number) => void) {
  const presign = await requestUploadUrl({
    courseId,
    fileName: file.name,
    mimeType: file.type as UploadUrlRequest['mimeType'],
    fileSize: file.size,
    relatedType: 'material',
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
