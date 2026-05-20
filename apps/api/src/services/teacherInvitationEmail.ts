export interface InvitationEmailVars {
  inviterName: string;
  inviteUrl: string;
  expiresDays: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  // Same as escapeHtml — keeps things explicit for the URL attribute below.
  return escapeHtml(s);
}

/**
 * Render the teacher-invitation email. Pure function so it can be snapshot
 * tested without any Worker/network dependencies.
 *
 * The HTML uses table-based layout + inline styles because real-world email
 * clients (Outlook, Yahoo, older Gmail) don't reliably render flexbox or
 * external stylesheets. Web-safe fonts only.
 */
export function renderTeacherInvitationEmail(v: InvitationEmailVars): RenderedEmail {
  const subject = `${v.inviterName} invited you to teach on CourseWise`;
  const inviter = escapeHtml(v.inviterName);
  const url = escapeAttr(v.inviteUrl);
  const urlDisplay = escapeHtml(v.inviteUrl);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${inviter} invited you to teach on CourseWise. Accept within ${v.expiresDays} days.
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
                You've been invited to teach
              </h1>
              <p style="margin:0 0 16px 0;font-size:16px;color:#334155;">
                <strong style="color:#0f172a;">${inviter}</strong> has invited you to join CourseWise as a teacher. Click the button below to accept and set up your account.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#0f172a;border-radius:6px;">
                    <a href="${url}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                      Accept invitation
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
                This invitation expires in <strong>${v.expiresDays} days</strong>. If you weren't expecting this email, you can safely ignore it.
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

  const text = `${v.inviterName} invited you to teach on CourseWise

Accept the invitation by visiting:
${v.inviteUrl}

This invitation expires in ${v.expiresDays} days. If you weren't expecting this email, you can safely ignore it.

---
CourseWise · Course management, reimagined`;

  return { subject, html, text };
}
