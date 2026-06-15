export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  NOT_IN_GROUP: 'NOT_IN_GROUP',
  ASSIGNMENT_WINDOW_CLOSED: 'ASSIGNMENT_WINDOW_CLOSED',
  COURSE_ENDED: 'COURSE_ENDED',
  RATE_LIMITED: 'RATE_LIMITED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_INVITATION: 'INVALID_INVITATION',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  EMAIL_ALREADY_USER: 'EMAIL_ALREADY_USER',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  MISSING_SCOPE: 'MISSING_SCOPE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_I18N: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'errors.validation',
  UNAUTHORIZED: 'errors.unauthorized',
  FORBIDDEN: 'errors.forbidden',
  NOT_FOUND: 'errors.notFound',
  CONFLICT: 'errors.conflict',
  NOT_IN_GROUP: 'errors.notInGroup',
  ASSIGNMENT_WINDOW_CLOSED: 'errors.assignmentWindowClosed',
  COURSE_ENDED: 'errors.courseEnded',
  RATE_LIMITED: 'errors.rateLimited',
  ACCOUNT_LOCKED: 'errors.accountLocked',
  ACCOUNT_INACTIVE: 'errors.accountInactive',
  INVALID_CREDENTIALS: 'errors.invalidCredentials',
  INVALID_INVITATION: 'errors.invalidInvitation',
  INVITATION_EXPIRED: 'errors.invitationExpired',
  INVITATION_REVOKED: 'errors.invitationRevoked',
  INVITATION_ACCEPTED: 'errors.invitationAccepted',
  EMAIL_ALREADY_USER: 'errors.emailAlreadyUser',
  INVALID_TOKEN: 'errors.invalidToken',
  TOKEN_REVOKED: 'errors.tokenRevoked',
  TOKEN_EXPIRED: 'errors.tokenExpired',
  MISSING_SCOPE: 'errors.missingScope',
  INTERNAL_ERROR: 'errors.internal',
  UPSTREAM_UNAVAILABLE: 'errors.upstreamUnavailable',
};

export class ApiException extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: { path: (string | number)[]; code: string; i18nKey: string }[];
  readonly i18nKey: string;

  constructor(
    status: number,
    code: ErrorCode,
    message?: string,
    details?: { path: (string | number)[]; code: string; i18nKey: string }[],
  ) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.i18nKey = ERROR_I18N[code];
    if (details) this.details = details;
  }
}
