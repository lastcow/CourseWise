import type { Context } from 'hono';
import type { AppEnv } from '../types';

/**
 * Resolve the best base origin for building user-facing links (e.g. emailed
 * reset/invite URLs). Prefers the request's own Origin header, then a parsed
 * Referer, then the configured CORS_ORIGIN, finally a localhost dev fallback.
 * Never throws on a malformed Referer.
 */
export function resolveRequestOrigin(c: Context<AppEnv>): string {
  const originHeader = c.req.header('origin');
  if (originHeader) return originHeader;
  const referer = c.req.header('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // fall through to CORS_ORIGIN
    }
  }
  if (c.env.CORS_ORIGIN && c.env.CORS_ORIGIN !== '*') return c.env.CORS_ORIGIN;
  return 'http://localhost:5173';
}
