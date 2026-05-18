import type { TeacherInvitationStatus, TeacherInvitationSummary } from '@coursewise/shared';
import { randomBase62, sha256Hex } from '../lib/crypto';
import type { TeacherInvitationRow } from '../db/schema';

export const TEACHER_INVITATION_TTL_DAYS = 7;
export const TEACHER_INVITATION_TTL_SECONDS = TEACHER_INVITATION_TTL_DAYS * 24 * 60 * 60;
export const TEACHER_INVITATION_TOKEN_LENGTH = 48;

export async function generateInvitationToken(): Promise<{ plaintext: string; hash: string }> {
  const plaintext = randomBase62(TEACHER_INVITATION_TOKEN_LENGTH);
  const hash = await sha256Hex(plaintext);
  return { plaintext, hash };
}

export function deriveInvitationStatus(
  row: Pick<TeacherInvitationRow, 'acceptedAt' | 'revokedAt' | 'expiresAt'>,
  now: Date = new Date(),
): TeacherInvitationStatus {
  if (row.acceptedAt) return 'accepted';
  if (row.revokedAt) return 'revoked';
  if (new Date(row.expiresAt) <= now) return 'expired';
  return 'pending';
}

export function toInvitationSummary(
  row: TeacherInvitationRow,
  inviterName: string,
): TeacherInvitationSummary {
  return {
    id: row.id,
    email: row.email,
    inviterName,
    inviterId: row.invitedByUserId,
    status: deriveInvitationStatus(row),
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt ?? null,
    acceptedUserId: row.acceptedUserId ?? null,
    revokedAt: row.revokedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function expiresAtFromNow(now: Date = new Date()): string {
  return new Date(now.getTime() + TEACHER_INVITATION_TTL_SECONDS * 1000).toISOString();
}

/**
 * Build a public URL that points to the front-end accept-invite page. We do
 * not own the web origin from inside the API, so we accept it as input — the
 * admin UI base URL is what the resulting link should target. When no base is
 * configured the link is returned as a relative path so the UI can prepend
 * its own origin.
 */
export function buildInviteUrl(token: string, webBase: string | undefined | null): string {
  const path = `/teacher/accept-invite?token=${encodeURIComponent(token)}`;
  if (!webBase) return path;
  return webBase.replace(/\/$/, '') + path;
}
