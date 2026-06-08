import type { RenderedEmail } from './teacherInvitationEmail';

export interface QuizScheduleOpenEmailVars {
  name: string;
  quizTitle: string;
  courseTitle: string;
  /** The wave's name, e.g. "Wave A" / "The rest". Null for the quiz default. */
  scheduleName?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  /** Absolute or relative link to the student quiz page. */
  link?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

/**
 * Email sent when a student's quiz tester schedule (wave) opens. Pure function —
 * the cron job invokes the Cloudflare Email Service binding with the output.
 */
export function renderQuizScheduleOpenEmail(v: QuizScheduleOpenEmailVars): RenderedEmail {
  const name = v.name?.trim() ? escapeHtml(v.name) : 'there';
  const quizTitle = escapeHtml(v.quizTitle);
  const courseTitle = escapeHtml(v.courseTitle);
  const opens = fmt(v.opensAt);
  const closes = fmt(v.closesAt);
  const link = v.link ?? null;
  const subject = `Your quiz is now open: ${v.quizTitle}`;

  const whenSection = closes
    ? `<p style="margin:0 0 16px 0;font-size:14px;color:#475569;">It is open until <strong style="color:#0f172a;">${escapeHtml(closes)}</strong>.</p>`
    : opens
      ? `<p style="margin:0 0 16px 0;font-size:14px;color:#475569;">It opened at <strong style="color:#0f172a;">${escapeHtml(opens)}</strong>.</p>`
      : '';

  const buttonSection = link
    ? `<p style="margin:24px 0 0 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">Open the quiz</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
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
              <h1 style="font-size:22px;font-weight:600;margin:0 0 16px 0;color:#0f172a;">Your quiz is now open</h1>
              <p style="margin:0 0 16px 0;font-size:16px;color:#334155;">
                Hi ${name}, <strong style="color:#0f172a;">${quizTitle}</strong> in ${courseTitle} is now available for you${v.scheduleName ? ` (${escapeHtml(v.scheduleName)})` : ''}.
              </p>
              ${whenSection}
              ${buttonSection}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">CourseWise · Course management, reimagined</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    'Your quiz is now open',
    '',
    `Hi ${v.name || 'there'},`,
    '',
    `${v.quizTitle} in ${v.courseTitle} is now available for you${v.scheduleName ? ` (${v.scheduleName})` : ''}.`,
  ];
  if (closes) textLines.push('', `It is open until ${closes}.`);
  else if (opens) textLines.push('', `It opened at ${opens}.`);
  if (link) textLines.push('', `Open the quiz: ${link}`);
  textLines.push('', '---', 'CourseWise · Course management, reimagined');

  return { subject, html, text: textLines.join('\n') };
}
