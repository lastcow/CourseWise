import type { Context } from 'hono';
import { ApiException, ERROR_CODES } from './errors';

/** Require a route param to be present and non-empty. */
export function requireParam(c: Context, name: string): string {
  const v = c.req.param(name);
  if (!v) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, `Missing path parameter: ${name}`);
  return v;
}
