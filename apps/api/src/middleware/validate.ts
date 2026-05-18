import type { MiddlewareHandler } from 'hono';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiException, ERROR_CODES } from '../lib/errors';
import type { AppEnv } from '../types';

export function validateJson<Schema extends ZodTypeAny>(schema: Schema): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body');
    }
    try {
      const parsed = schema.parse(body) as z.infer<Schema>;
      c.set('validated', parsed);
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
          i18nKey: `errors.field.${issue.code}`,
        }));
        throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Validation failed', details);
      }
      throw err;
    }
    await next();
  };
}
