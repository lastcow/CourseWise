import { Hono } from 'hono';
import { contactMessageSchema, type ContactMessageInput } from '@coursewise/shared';
import { success } from '../lib/response';
import { validateJson } from '../middleware/validate';
import type { AppEnv } from '../types';

const contact = new Hono<AppEnv>();

contact.post('/contact', validateJson(contactMessageSchema), async (c) => {
  const input = c.get('validated') as ContactMessageInput;
  // Stub sink: logs the full submission so `wrangler tail` can read it.
  // Follow-up: replace with a real email/Slack relay or a DB-backed
  // ticket queue. Today the only receiver is the Worker console.
  console.log('contact.message', {
    subject: input.subject,
    name: input.name,
    email: input.email,
    institution: input.institution ?? null,
    message: input.message,
  });
  return success(c, { received: true });
});

export default contact;
