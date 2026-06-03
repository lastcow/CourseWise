import type { RenderedEmail } from './teacherInvitationEmail';

export interface CourseExportEmailVars {
  courseName: string;
  /** Link to the in-app page where the (logged-in) teacher can download the ZIP. */
  linkUrl: string;
  /** Hours until the export is automatically deleted. */
  expiresHours: number;
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
 * Render the "your course export is ready" email. The link points at an
 * authenticated CourseWise page — the recipient must sign in and be a teacher
 * of the course before the download is issued, so the link alone can't leak
 * student data. Pure function for snapshot testing.
 */
export function renderCourseExportEmail(v: CourseExportEmailVars): RenderedEmail {
  const subject = `Your CourseWise export for "${v.courseName}" is ready`;
  const url = escapeHtml(v.linkUrl);
  const urlDisplay = escapeHtml(v.linkUrl);
  const course = escapeHtml(v.courseName);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    Your course export for ${course} is ready to download.
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
                Your course export is ready
              </h1>
              <p style="margin:0 0 16px 0;font-size:16px;color:#334155;">
                The export for <strong>${course}</strong> has finished building. Open CourseWise (signed in) to download the ZIP — it includes reading materials, assignments and other gradable items with submissions and scores.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#0f172a;border-radius:6px;">
                    <a href="${url}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                      Download export
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:14px;color:#64748b;">
                Or paste this link into your browser:
              </p>
              <p style="margin:0 0 24px 0;font-size:13px;color:#475569;word-break:break-all;">
                <a href="${url}" style="color:#2563eb;text-decoration:underline;">${urlDisplay}</a>
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                You'll need to be signed in as a teacher of this course to download. For privacy, this export is automatically deleted <strong>${v.expiresHours} hours</strong> after it was generated.
              </p>
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

  const text = `Your CourseWise export for "${v.courseName}" is ready

Sign in to CourseWise and download the ZIP here:
${v.linkUrl}

It includes reading materials, assignments and other gradable items with submissions and scores.
You must be signed in as a teacher of this course to download. For privacy, this export is automatically deleted ${v.expiresHours} hours after it was generated.

---
CourseWise · Course management, reimagined`;

  return { subject, html, text };
}
