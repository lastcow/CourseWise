import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../lib/crypto';
import {
  TEACHER_INVITATION_TOKEN_LENGTH,
  TEACHER_INVITATION_TTL_DAYS,
  TEACHER_INVITATION_TTL_SECONDS,
  buildInviteUrl,
  deriveInvitationStatus,
  expiresAtFromNow,
  generateInvitationToken,
  toInvitationSummary,
} from './teacherInvitations';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

describe('generateInvitationToken', () => {
  it('produces a token of the expected length whose hash matches a re-hash', async () => {
    const { plaintext, hash } = await generateInvitationToken();
    expect(plaintext).toHaveLength(TEACHER_INVITATION_TOKEN_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(plaintext)).toBe(hash);
  });

  it('returns distinct values on each call', async () => {
    const a = await generateInvitationToken();
    const b = await generateInvitationToken();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('expiresAtFromNow', () => {
  it('returns a timestamp 7 days into the future by default', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiresAt = new Date(expiresAtFromNow(now));
    const delta = expiresAt.getTime() - now.getTime();
    expect(delta).toBe(TEACHER_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    expect(TEACHER_INVITATION_TTL_SECONDS).toBe(TEACHER_INVITATION_TTL_DAYS * 24 * 60 * 60);
  });
});

describe('deriveInvitationStatus', () => {
  const futureExpiry = new Date(Date.now() + TWELVE_HOURS_MS).toISOString();
  const pastExpiry = new Date(Date.now() - TWELVE_HOURS_MS).toISOString();

  it('returns pending when not accepted, not revoked, not expired', () => {
    expect(
      deriveInvitationStatus({
        acceptedAt: null,
        revokedAt: null,
        expiresAt: futureExpiry,
      }),
    ).toBe('pending');
  });

  it('returns accepted when acceptedAt is set, even if revoked or expired', () => {
    const acceptedAt = new Date().toISOString();
    expect(
      deriveInvitationStatus({
        acceptedAt,
        revokedAt: new Date().toISOString(),
        expiresAt: pastExpiry,
      }),
    ).toBe('accepted');
  });

  it('returns revoked when revokedAt is set and not accepted', () => {
    expect(
      deriveInvitationStatus({
        acceptedAt: null,
        revokedAt: new Date().toISOString(),
        expiresAt: futureExpiry,
      }),
    ).toBe('revoked');
  });

  it('returns expired only when not accepted, not revoked, and past expiry', () => {
    expect(
      deriveInvitationStatus({
        acceptedAt: null,
        revokedAt: null,
        expiresAt: pastExpiry,
      }),
    ).toBe('expired');
  });
});

describe('buildInviteUrl', () => {
  it('builds an absolute URL when a base origin is provided', () => {
    expect(buildInviteUrl('abc', 'https://example.com')).toBe(
      'https://example.com/teacher/accept-invite?token=abc',
    );
  });

  it('trims a trailing slash on the base URL', () => {
    expect(buildInviteUrl('abc', 'https://example.com/')).toBe(
      'https://example.com/teacher/accept-invite?token=abc',
    );
  });

  it('returns a path-only URL when no base is provided', () => {
    expect(buildInviteUrl('abc', null)).toBe('/teacher/accept-invite?token=abc');
    expect(buildInviteUrl('abc', undefined)).toBe('/teacher/accept-invite?token=abc');
  });

  it('encodes the token to keep the URL safe for direct interpolation', () => {
    expect(buildInviteUrl('a/b c', null)).toBe('/teacher/accept-invite?token=a%2Fb%20c');
  });
});

describe('toInvitationSummary', () => {
  const baseRow = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'TEACHER@example.com',
    invitedByUserId: '22222222-2222-2222-2222-222222222222',
    tokenHash: 'deadbeef',
    expiresAt: new Date(Date.now() + TWELVE_HOURS_MS).toISOString(),
    acceptedAt: null,
    acceptedUserId: null,
    revokedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('maps DB fields to the public summary and derives status', () => {
    const summary = toInvitationSummary(baseRow, 'Alice');
    expect(summary.id).toBe(baseRow.id);
    expect(summary.email).toBe(baseRow.email);
    expect(summary.inviterId).toBe(baseRow.invitedByUserId);
    expect(summary.inviterName).toBe('Alice');
    expect(summary.status).toBe('pending');
  });

  it('marks accepted invitations regardless of expiry', () => {
    const summary = toInvitationSummary(
      { ...baseRow, acceptedAt: '2026-01-02T00:00:00.000Z' },
      'Alice',
    );
    expect(summary.status).toBe('accepted');
  });
});
