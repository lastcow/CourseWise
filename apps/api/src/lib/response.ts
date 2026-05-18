import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError } from '@coursewise/shared';
import { ApiException, ERROR_CODES, ERROR_I18N } from './errors';

export function success<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true, data }, status);
}

export function failure(c: Context, exception: ApiException) {
  const body: { success: false; error: ApiError } = {
    success: false,
    error: {
      code: exception.code,
      message: exception.message,
      i18nKey: exception.i18nKey,
      ...(exception.details ? { details: exception.details } : {}),
    },
  };
  return c.json(body, exception.status as ContentfulStatusCode);
}

export function unhandledFailure(c: Context, err: unknown) {
  const body: { success: false; error: ApiError } = {
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: err instanceof Error ? err.message : 'Internal error',
      i18nKey: ERROR_I18N.INTERNAL_ERROR,
    },
  };
  return c.json(body, 500);
}
