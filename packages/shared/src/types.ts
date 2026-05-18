import type {
  ApiTokenScope,
  CourseStatus,
  FileAssetStatus,
  InvitationStatus,
  Locale,
  MaterialSourceType,
  MaterialStatus,
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

export interface MaterialSummary {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
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

export interface UploadUrlResponse {
  uploadUrl: string;
  fileAssetId: string;
  r2Key: string;
  expiresAt: string;
  headers: Record<string, string>;
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
