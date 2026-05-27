import { describe, expect, it } from 'vitest';
import { generateResetToken, PASSWORD_RESET_TTL_MINUTES, resetExpiry } from './passwordReset';

describe('generateResetToken', () => {
  it('returns a 48-char plaintext and its sha256 hash', async () => {
    const a = await generateResetToken();
    expect(a.plaintext).toHaveLength(48);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    const b = await generateResetToken();
    expect(b.plaintext).not.toEqual(a.plaintext); // random
  });
});

describe('resetExpiry', () => {
  it('is PASSWORD_RESET_TTL_MINUTES in the future', () => {
    const now = new Date('2026-05-27T00:00:00.000Z');
    expect(resetExpiry(now)).toBe(
      new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000).toISOString(),
    );
  });
});
