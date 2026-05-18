import {
  ADMIN_TOKEN_SCOPES,
  API_TOKEN_PREFIX,
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
  // students cannot create tokens in this milestone
  return { ok: false, bad: [...scopes] };
}
