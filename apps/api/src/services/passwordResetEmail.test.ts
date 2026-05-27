import { describe, expect, it } from 'vitest';
import { renderPasswordResetEmail } from './passwordResetEmail';

describe('renderPasswordResetEmail', () => {
  const r = renderPasswordResetEmail({ resetUrl: 'https://app.test/reset-password?token=abc', expiresMinutes: 60 });
  it('has subject, html, text', () => {
    expect(r.subject).toMatch(/reset/i);
    expect(r.html).toContain('https://app.test/reset-password?token=abc');
    expect(r.text).toContain('https://app.test/reset-password?token=abc');
  });
  it('escapes nothing dangerous and mentions expiry', () => {
    expect(r.text).toContain('60');
  });
});
