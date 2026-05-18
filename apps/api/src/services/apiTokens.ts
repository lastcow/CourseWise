import {
  ADMIN_TOKEN_SCOPES,
  API_TOKEN_PREFIX,
  STUDENT_ALLOWED_SCOPES,
  TEACHER_ALLOWED_SCOPES,
  type ApiTokenScope,
  type UserRole,
} from '@coursewise/shared';
import { randomBase62, sha256Hex } from '../lib/crypto';

export interface GeneratedApiToken {
  plaintext: string;
  hash: string;
}

export async function generateApiToken(): Promise<GeneratedApiToken> {
  const body = randomBase62(43);
  const plaintext = `${API_TOKEN_PREFIX}${body}`;
  const hash = await sha256Hex(plaintext);
  return { plaintext, hash };
}

export async function hashApiToken(plaintext: string): Promise<string> {
  return sha256Hex(plaintext);
}

export function hasScope(granted: readonly string[], required: ApiTokenScope): boolean {
  return granted.includes(required);
}

export function isAdminScope(scope: string): scope is ApiTokenScope {
  return ADMIN_TOKEN_SCOPES.includes(scope as ApiTokenScope);
}

export function rejectScopesForRole(
  role: UserRole,
  scopes: readonly string[],
): { ok: true } | { ok: false; bad: string[] } {
  if (role === 'admin') {
    return { ok: true };
  }
  if (role === 'teacher') {
    const bad = scopes.filter((s) => !TEACHER_ALLOWED_SCOPES.includes(s as ApiTokenScope));
    return bad.length === 0 ? { ok: true } : { ok: false, bad };
  }
  if (role === 'student') {
    const bad = scopes.filter((s) => !STUDENT_ALLOWED_SCOPES.includes(s as ApiTokenScope));
    return bad.length === 0 ? { ok: true } : { ok: false, bad };
  }
  return { ok: false, bad: [...scopes] };
}

/**
 * Default scope set granted to a self-service token for the given role.
 * The server binds these automatically — clients never supply scopes, so they
 * cannot escalate beyond what their role already allows.
 */
export function defaultScopesForRole(role: UserRole): ApiTokenScope[] {
  if (role === 'admin') return [...ADMIN_TOKEN_SCOPES];
  if (role === 'teacher') return [...TEACHER_ALLOWED_SCOPES];
  if (role === 'student') return [...STUDENT_ALLOWED_SCOPES];
  return [];
}
