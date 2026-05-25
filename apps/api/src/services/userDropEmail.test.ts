import { describe, expect, it } from 'vitest';
import { renderStudentDropEmail } from './userDropEmail';

describe('renderStudentDropEmail', () => {
  const baseVars = {
    name: 'Alice Student',
    courses: [
      { code: 'CS101', title: 'Intro to CS' },
      { code: 'MATH200', title: 'Linear Algebra' },
    ],
  };

  it('sets a fixed subject line', () => {
    const out = renderStudentDropEmail(baseVars);
    expect(out.subject).toBe('Your CourseWise account has been removed');
  });

  it('includes the recipient name in both html and text greetings', () => {
    const out = renderStudentDropEmail(baseVars);
    expect(out.html).toContain('Hi Alice Student');
    expect(out.text).toContain('Hi Alice Student');
  });

  it('falls back to "there" when name is empty', () => {
    const out = renderStudentDropEmail({ ...baseVars, name: '' });
    expect(out.text).toContain('Hi there');
    expect(out.html).toContain('Hi there');
  });

  it('lists each course code and title in both html and text', () => {
    const out = renderStudentDropEmail(baseVars);
    for (const c of baseVars.courses) {
      expect(out.html).toContain(c.code);
      expect(out.html).toContain(c.title);
      expect(out.text).toContain(c.code);
      expect(out.text).toContain(c.title);
    }
  });

  it('omits the courses block entirely when no courses are passed', () => {
    const out = renderStudentDropEmail({ ...baseVars, courses: [] });
    expect(out.html).not.toContain('You were enrolled in the following');
    expect(out.text).not.toContain('You were enrolled in the following');
  });

  it('shows the reason line when provided', () => {
    const out = renderStudentDropEmail({
      ...baseVars,
      reason: 'Registered with wrong email',
    });
    expect(out.html).toContain('Registered with wrong email');
    expect(out.text).toContain('Reason: Registered with wrong email');
  });

  it('escapes html-significant characters in name and reason', () => {
    const out = renderStudentDropEmail({
      ...baseVars,
      name: 'A<b>c',
      reason: '"weird & reason"',
    });
    expect(out.html).toContain('A&lt;b&gt;c');
    expect(out.html).toContain('&quot;weird &amp; reason&quot;');
  });

  it('shows the support email when provided', () => {
    const out = renderStudentDropEmail({ ...baseVars, supportEmail: 'help@coursewise.test' });
    expect(out.html).toContain('mailto:help@coursewise.test');
    expect(out.text).toContain('help@coursewise.test');
  });
});
