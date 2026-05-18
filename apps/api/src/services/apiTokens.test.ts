import { describe, expect, it } from 'vitest';
import { generateApiToken, hashApiToken, isAdminScope, rejectScopesForRole } from './apiTokens';
import { API_TOKEN_PREFIX } from '@coursewise/shared';

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

  it('students cannot mint any token', () => {
    const r = rejectScopesForRole('student', ['student:read']);
    expect(r.ok).toBe(false);
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
