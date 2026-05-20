import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

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
 * separate name + addr parts. Falls back to addr-only when there is no name.
 */
function parseAddress(raw: string): { name: string; addr: string } {
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1] ?? '', addr: (m[2] ?? '').trim() };
  return { name: '', addr: raw.trim() };
}

/**
 * Send an email via the Cloudflare Worker `send_email` binding.
 *
 * IMPORTANT CONSTRAINT: this binding only delivers to addresses listed in the
 * binding's `allowed_destination_addresses` (configured in wrangler.toml).
 * `.send()` throws for non-allowlisted recipients, which the caller can catch
 * and treat as a best-effort failure (e.g. fall back to copy-link UX).
 *
 * The MIME body is assembled with `mimetext` — that's the same package the
 * official Cloudflare docs recommend for this binding.
 */
export async function sendEmailViaCloudflare(
  binding: SendEmail,
  input: SendEmailInput,
): Promise<void> {
  const sender = parseAddress(input.from);
  const recipient = parseAddress(input.to);

  const msg = createMimeMessage();
  if (sender.name) {
    msg.setSender({ name: sender.name, addr: sender.addr });
  } else {
    msg.setSender(sender.addr);
  }
  msg.setRecipient(recipient.addr);
  msg.setSubject(input.subject);
  if (input.replyTo) {
    msg.setHeader('Reply-To', input.replyTo);
  }
  // Multipart/alternative: clients pick the LAST matching part as the
  // preferred view. Add text first so HTML-capable clients render the HTML
  // version while plaintext-only clients still get a readable body.
  msg.addMessage({ contentType: 'text/plain', data: input.text });
  msg.addMessage({ contentType: 'text/html', data: input.html });

  const email = new EmailMessage(sender.addr, recipient.addr, msg.asRaw());
  await binding.send(email);
}
