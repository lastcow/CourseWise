import type { RenderedEmail } from './teacherInvitationEmail';

export interface AnnouncementEmailVars {
  name: string;
  courseTitle: string;
  title: string;
  /** Absolute or relative link to the announcements feed. */
  link?: string | null;
}

type Lang = 'en' | 'zh-CN' | 'fr';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COPY: Record<Lang, { subject: (t: string) => string; heading: string; body: (name: string, course: string) => string; button: string; footer: string }> = {
  en: {
    subject: (t) => `New announcement: ${t}`,
    heading: 'New announcement',
    body: (name, course) => `Hi ${name}, a new announcement was posted in ${course}.`,
    button: 'View announcement',
    footer: 'CourseWise · Course management, reimagined',
  },
  'zh-CN': {
    subject: (t) => `新公告:${t}`,
    heading: '新公告',
    body: (name, course) => `${name},你好。${course} 发布了一条新公告。`,
    button: '查看公告',
    footer: 'CourseWise · 重新构想的课程管理',
  },
  fr: {
    subject: (t) => `Nouvelle annonce : ${t}`,
    heading: 'Nouvelle annonce',
    body: (name, course) => `Bonjour ${name}, une nouvelle annonce a été publiée dans ${course}.`,
    button: "Voir l'annonce",
    footer: 'CourseWise · La gestion de cours, repensée',
  },
};

/**
 * Email sent to a recipient when an announcement is published. Pure function —
 * the publish service invokes the Cloudflare Email Service with the output.
 */
export function renderAnnouncementEmail(lang: string, v: AnnouncementEmailVars): RenderedEmail {
  const c = COPY[(lang as Lang) in COPY ? (lang as Lang) : 'en'];
  const name = v.name?.trim() ? escapeHtml(v.name) : 'there';
  const courseTitle = escapeHtml(v.courseTitle);
  const title = escapeHtml(v.title);
  const link = v.link ?? null;
  const subject = c.subject(v.title);

  const buttonSection = link
    ? `<p style="margin:24px 0 0 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">${escapeHtml(c.button)}</a></p>`
    : '';

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="background-color:#0f172a;padding:24px 32px;"><span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.4px;">CourseWise</span></td></tr>
        <tr><td style="padding:32px;">
          <h1 style="font-size:22px;font-weight:600;margin:0 0 16px 0;color:#0f172a;">${escapeHtml(c.heading)}</h1>
          <p style="margin:0 0 12px 0;font-size:16px;color:#334155;">${c.body(name, courseTitle)}</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#0f172a;">${title}</p>
          ${buttonSection}
        </td></tr>
        <tr><td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">${escapeHtml(c.footer)}</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [c.heading, '', c.body(v.name || 'there', v.courseTitle), '', v.title];
  if (link) textLines.push('', `${c.button}: ${link}`);
  textLines.push('', '---', c.footer);

  return { subject, html, text: textLines.join('\n') };
}
