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
  it('escapes html-significant characters in the reset URL so href stays well-formed', () => {
    const out = renderPasswordResetEmail({
      resetUrl: 'https://app.test/reset-password?token=a&b="c"',
      expiresMinutes: 60,
    });
    // Escaped variants should appear in the HTML.
    expect(out.html).toContain('&amp;');
    expect(out.html).toContain('&quot;');
    // The raw, unescaped sequence must NOT leak into the href.
    expect(out.html).not.toContain('&b="c"');
  });
});
