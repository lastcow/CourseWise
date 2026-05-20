import { ApiException, ERROR_CODES } from '../lib/errors';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
}

export interface ResendOptions {
  apiKey: string;
  from: string;
  /** Override the endpoint for tests. */
  baseUrl?: string;
  /** Injectable fetch for tests. */
  fetcher?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.resend.com';

/**
 * Thin Resend client. We hand-roll the request rather than depend on the
 * official SDK so the Worker bundle stays small. Throws an ApiException on
 * non-2xx so callers can decide whether the send is fatal (block the user
 * flow) or best-effort (log + continue).
 */
export async function sendEmailViaResend(
  input: SendEmailInput,
  opts: ResendOptions,
): Promise<{ id: string }> {
  const fetcher = opts.fetcher ?? fetch;
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const res = await fetcher(`${baseUrl}/emails`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      from: opts.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new ApiException(
      502,
      ERROR_CODES.INTERNAL_ERROR,
      `Resend POST /emails → ${res.status}: ${body.slice(0, 500)}`,
    );
  }
  if (!body) return { id: '' };
  try {
    const parsed = JSON.parse(body) as { id?: string };
    return { id: parsed.id ?? '' };
  } catch {
    throw new ApiException(
      502,
      ERROR_CODES.INTERNAL_ERROR,
      `Resend returned non-JSON body: ${body.slice(0, 200)}`,
    );
  }
}
