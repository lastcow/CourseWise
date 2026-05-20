import { describe, expect, it } from 'vitest';
import { renderTeacherInvitationEmail } from './teacherInvitationEmail';

describe('renderTeacherInvitationEmail', () => {
  const baseVars = {
    inviterName: 'Alice Admin',
    inviteUrl: 'https://fsuac.com/teacher/accept-invite?token=abc123',
    expiresDays: 7,
  };

  it('builds a subject line with the inviter name', () => {
    const out = renderTeacherInvitationEmail(baseVars);
    expect(out.subject).toBe('Alice Admin invited you to teach on CourseWise');
  });

  it('includes the invite URL verbatim in both html href and text body', () => {
    const out = renderTeacherInvitationEmail(baseVars);
    // href + visible link in HTML
    expect(out.html).toContain(`href="${baseVars.inviteUrl}"`);
    // plain text body
    expect(out.text).toContain(baseVars.inviteUrl);
  });

  it('includes the expiry days in both html and text', () => {
    const out = renderTeacherInvitationEmail({ ...baseVars, expiresDays: 14 });
    expect(out.html).toContain('14 days');
    expect(out.text).toContain('14 days');
  });

  it('escapes html-significant characters in inviter name', () => {
    const out = renderTeacherInvitationEmail({
      ...baseVars,
      inviterName: 'Bob <script>alert(1)</script> & "evil"',
    });
    // Raw script must NOT appear in the HTML
    expect(out.html).not.toContain('<script>alert(1)</script>');
    // Escaped variants should
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('&amp;');
    expect(out.html).toContain('&quot;evil&quot;');
    // Plain text body preserves the raw name (text/plain doesn't render html)
    expect(out.text).toContain('Bob <script>alert(1)</script> & "evil"');
  });

  it('escapes characters in the invite URL so href stays well-formed', () => {
    const out = renderTeacherInvitationEmail({
      ...baseVars,
      inviteUrl: 'https://fsuac.com/teacher/accept-invite?token=a&b="c"',
    });
    // The href must not contain a raw `"` mid-attribute — escapeHtml turns it
    // into `&quot;` so the attribute closes correctly.
    expect(out.html).toContain(
      'href="https://fsuac.com/teacher/accept-invite?token=a&amp;b=&quot;c&quot;"',
    );
  });

  it('produces a non-empty text fallback', () => {
    const out = renderTeacherInvitationEmail(baseVars);
    expect(out.text.length).toBeGreaterThan(50);
    expect(out.text).toContain('CourseWise');
  });

  it('marks up the CTA button with the canonical brand colours', () => {
    const out = renderTeacherInvitationEmail(baseVars);
    // The slate-900 background on the CTA is part of the visual identity —
    // catch accidental regressions.
    expect(out.html).toContain('background-color:#0f172a');
    expect(out.html).toContain('Accept invitation');
  });
});
