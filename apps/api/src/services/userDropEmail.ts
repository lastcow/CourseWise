import type { RenderedEmail } from './teacherInvitationEmail';

export interface StudentDropEmailCourse {
  code: string;
  title: string;
}

export interface StudentDropEmailVars {
  name: string;
  courses: StudentDropEmailCourse[];
  reason?: string | null;
  /** Optional support address; if omitted, no support sentence is shown. */
  supportEmail?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Notification email sent when an admin or teacher deletes a student
 * account. Used to make the (typically wrong-email) recipient aware so
 * they can either disregard or contact support.
 *
 * Pure function — the Worker route is responsible for invoking the
 * Cloudflare Email Service binding with the rendered output.
 */
export function renderStudentDropEmail(v: StudentDropEmailVars): RenderedEmail {
  const subject = 'Your CourseWise account has been removed';
  const name = v.name?.trim() ? escapeHtml(v.name) : 'there';
  const courses = v.courses ?? [];
  const reason = v.reason && v.reason.trim() ? escapeHtml(v.reason.trim()) : null;
  const support = v.supportEmail && v.supportEmail.trim() ? v.supportEmail.trim() : null;

  const courseRowsHtml = courses
    .map(
      (c) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#475569;font-family:'SFMono-Regular',Menlo,Monaco,Consolas,monospace;width:120px;">
            ${escapeHtml(c.code)}
          </td>
          <td style="padding:6px 0;font-size:14px;color:#0f172a;">
            ${escapeHtml(c.title)}
          </td>
        </tr>`,
    )
    .join('');

  const courseListSection = courses.length
    ? `<p style="margin:16px 0 8px 0;font-size:14px;color:#334155;">
        You were enrolled in the following ${courses.length === 1 ? 'course' : 'courses'}:
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:6px;border-collapse:separate;padding:8px 16px;margin-bottom:16px;">
        ${courseRowsHtml}
      </table>`
    : '';

  const reasonSection = reason
    ? `<p style="margin:0 0 16px 0;font-size:14px;color:#475569;">
        <strong style="color:#0f172a;">Reason:</strong> ${reason}
      </p>`
    : '';

  const supportSection = support
    ? `<p style="margin:24px 0 0 0;font-size:13px;color:#64748b;">
        If you believe this was a mistake, reply to this email or contact
        <a href="mailto:${escapeHtml(support)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(support)}</a>.
      </p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    Your CourseWise account at this email address has been removed.
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background-color:#0f172a;padding:24px 32px;">
              <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.4px;">CourseWise</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="font-size:22px;font-weight:600;margin:0 0 16px 0;color:#0f172a;">
                Your CourseWise account has been removed
              </h1>
              <p style="margin:0 0 16px 0;font-size:16px;color:#334155;">
                Hi ${name}, your CourseWise account registered with this email address was removed by your instructor or a CourseWise administrator. Your enrollments, submissions, and any account data have been deleted.
              </p>
              ${reasonSection}
              ${courseListSection}
              <p style="margin:0 0 8px 0;font-size:14px;color:#475569;">
                If this account was created with the wrong email address by mistake, you can safely ignore this message — no further action is needed.
              </p>
              ${supportSection}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                CourseWise · Course management, reimagined
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    'Your CourseWise account has been removed',
    '',
    `Hi ${v.name || 'there'},`,
    '',
    'Your CourseWise account registered with this email address was removed by your instructor or a CourseWise administrator. Your enrollments, submissions, and any account data have been deleted.',
  ];
  if (v.reason && v.reason.trim()) {
    textLines.push('', `Reason: ${v.reason.trim()}`);
  }
  if (courses.length > 0) {
    textLines.push('', `You were enrolled in the following ${courses.length === 1 ? 'course' : 'courses'}:`);
    for (const c of courses) {
      textLines.push(`  - ${c.code} · ${c.title}`);
    }
  }
  textLines.push(
    '',
    'If this account was created with the wrong email address by mistake, you can safely ignore this message — no further action is needed.',
  );
  if (support) {
    textLines.push('', `If you believe this was a mistake, reply to this email or contact ${support}.`);
  }
  textLines.push('', '---', 'CourseWise · Course management, reimagined');
  const text = textLines.join('\n');

  return { subject, html, text };
}
