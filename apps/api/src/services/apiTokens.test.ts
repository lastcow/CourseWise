import { describe, expect, it } from 'vitest';
import {
  defaultScopesForRole,
  generateApiToken,
  hashApiToken,
  isAdminScope,
  rejectScopesForRole,
} from './apiTokens';
import {
  ADMIN_TOKEN_SCOPES,
  API_TOKEN_PREFIX,
  STUDENT_ALLOWED_SCOPES,
  TEACHER_ALLOWED_SCOPES,
} from '@coursewise/shared';

describe('generateApiToken', () => {
  it('produces a properly prefixed token whose hash matches a re-hash', async () => {
    const { plaintext, hash } = await generateApiToken();
    expect(plaintext.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(plaintext.length).toBeGreaterThanOrEqual(48);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashApiToken(plaintext)).toBe(hash);
  });

  it('returns distinct values on each call', async () => {
    const a = await generateApiToken();
    const b = await generateApiToken();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('rejectScopesForRole', () => {
  it('admin can mint any defined scope', () => {
    expect(rejectScopesForRole('admin', ['admin:write', 'teacher:read'])).toEqual({ ok: true });
  });

  it('teacher cannot mint admin scopes', () => {
    const r = rejectScopesForRole('teacher', ['admin:write', 'teacher:read']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.bad).toContain('admin:write');
    }
  });

  it('students can mint tokens with student-allowed scopes', () => {
    expect(rejectScopesForRole('student', ['student:read'])).toEqual({ ok: true });
  });

  it('students cannot mint tokens that escalate beyond student scopes', () => {
    const r = rejectScopesForRole('student', ['student:read', 'admin:write']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.bad).toContain('admin:write');
    }
  });
});

describe('defaultScopesForRole', () => {
  it('admin gets the full admin scope set', () => {
    expect(defaultScopesForRole('admin')).toEqual([...ADMIN_TOKEN_SCOPES]);
  });
  it('teacher gets the teacher-allowed scopes (no admin scopes)', () => {
    const scopes = defaultScopesForRole('teacher');
    expect(scopes).toEqual([...TEACHER_ALLOWED_SCOPES]);
    expect(scopes.some((s) => s.startsWith('admin:'))).toBe(false);
  });
  it('student gets only student-allowed scopes', () => {
    const scopes = defaultScopesForRole('student');
    expect(scopes).toEqual([...STUDENT_ALLOWED_SCOPES]);
    expect(scopes.some((s) => s.startsWith('admin:'))).toBe(false);
    expect(scopes.some((s) => s.startsWith('teacher:'))).toBe(false);
  });
});

describe('isAdminScope', () => {
  it('recognizes admin scopes', () => {
    expect(isAdminScope('admin:write')).toBe(true);
    expect(isAdminScope('admin:tokens')).toBe(true);
  });
  it('rejects non-admin scopes', () => {
    expect(isAdminScope('teacher:read')).toBe(false);
    expect(isAdminScope('course:abc')).toBe(false);
  });
});
