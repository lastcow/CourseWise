import type { MiddlewareHandler } from 'hono';
import { SCOPE_GROUPS, type ApiTokenScope, type ScopeGroupName } from '@coursewise/shared';
import { ApiException, ERROR_CODES } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * Require any one of a named scope group. JWT callers always pass (they're
 * authorized by role); API token callers must hold at least one scope in the
 * group.
 */
export function requireScopeGroup(group: ScopeGroupName): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) throw new ApiException(401, ERROR_CODES.UNAUTHORIZED);
    if (auth.method === 'jwt') return next();
    const allowed: readonly ApiTokenScope[] = SCOPE_GROUPS[group];
    if (!allowed.some((scope) => auth.scopes.includes(scope))) {
      throw new ApiException(
        403,
        ERROR_CODES.MISSING_SCOPE,
        `Token missing scope for ${group} (need one of: ${allowed.join(', ')})`,
      );
    }
    return next();
  };
}
