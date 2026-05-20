export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Either "Name <addr@domain>" or a bare "addr@domain". */
  from: string;
  replyTo?: string | null;
}

/**
 * Parse a From header value (e.g. `"CourseWise <noreply@fsuac.com>"`) into
 * the `{ email, name }` object shape that the Cloudflare binding accepts.
 * Bare addresses (no angle brackets) come back as a plain string so the
 * binding falls through its `string | EmailAddress` union without a name.
 */
function parseFrom(raw: string): string | { email: string; name: string } {
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m && m[1] && m[2]) {
    return { email: m[2].trim(), name: m[1] };
  }
  return raw.trim();
}

/**
 * Send an email via Cloudflare's Email Service (beta) Worker binding.
 *
 * Unlike the older Email Routing send_email binding (which only delivers to
 * verified destinations on an allowlist), Email Service supports arbitrary
 * recipient addresses once the sender domain is verified via DKIM/SPF/MX/DMARC
 * DNS records — that setup is operator-side, not in code.
 *
 * Returns the Cloudflare `messageId` on success. Throws on transport errors;
 * the caller decides whether the send is fatal or best-effort.
 *
 * See https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 */
export async function sendEmailViaCloudflare(
  binding: SendEmail,
  input: SendEmailInput,
): Promise<EmailSendResult> {
  return binding.send({
    from: parseFrom(input.from),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });
}
