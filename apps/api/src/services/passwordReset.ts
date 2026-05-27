import { and, eq, isNull } from 'drizzle-orm';
import { randomBase62, sha256Hex } from '../lib/crypto';
import { passwordResetTokens } from '../db/schema';
import type { Db } from '../db/client';

export const PASSWORD_RESET_TTL_MINUTES = 60;
export const PASSWORD_RESET_TOKEN_LENGTH = 48;

export async function generateResetToken(): Promise<{ plaintext: string; hash: string }> {
  const plaintext = randomBase62(PASSWORD_RESET_TOKEN_LENGTH);
  const hash = await sha256Hex(plaintext);
  return { plaintext, hash };
}

export function resetExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000).toISOString();
}

/** Mark every still-unused token for a user as used, so only the newest link works. */
export async function invalidateUserResetTokens(db: Db, userId: string): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
}

/**
 * Issue a fresh reset token for a user: invalidate older ones, insert the new
 * hash. Returns the plaintext to embed in the link. Pure DB + crypto, no email.
 */
export async function issueResetToken(db: Db, userId: string): Promise<string> {
  await invalidateUserResetTokens(db, userId);
  const { plaintext, hash } = await generateResetToken();
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hash,
    expiresAt: resetExpiry(),
  });
  return plaintext;
}
