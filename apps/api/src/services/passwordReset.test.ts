import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../lib/crypto';
import {
  generateResetToken,
  PASSWORD_RESET_TOKEN_LENGTH,
  resetExpiry,
} from './passwordReset';

describe('generateResetToken', () => {
  it('returns a 48-char plaintext and its sha256 hash', async () => {
    const a = await generateResetToken();
    expect(a.plaintext).toHaveLength(PASSWORD_RESET_TOKEN_LENGTH);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(a.plaintext)).toBe(a.hash);
    const b = await generateResetToken();
    expect(b.plaintext).not.toEqual(a.plaintext); // random
    expect(b.hash).not.toEqual(a.hash);
  });
});

describe('resetExpiry', () => {
  it('is PASSWORD_RESET_TTL_MINUTES in the future', () => {
    const now = new Date('2026-05-27T00:00:00.000Z');
    expect(resetExpiry(now)).toBe('2026-05-27T01:00:00.000Z');
  });
});
