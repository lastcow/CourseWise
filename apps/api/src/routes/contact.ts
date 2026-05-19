import { Hono } from 'hono';
import { contactMessageSchema, type ContactMessageInput } from '@coursewise/shared';
import { success } from '../lib/response';
import { validateJson } from '../middleware/validate';
import type { AppEnv } from '../types';

const contact = new Hono<AppEnv>();

contact.post('/contact', validateJson(contactMessageSchema), async (c) => {
  const input = c.get('validated') as ContactMessageInput;
  console.log('contact.message', {
    subject: input.subject,
    email: input.email,
    institution: input.institution ?? null,
    messageLength: input.message.length,
  });
  return success(c, { received: true });
});

export default contact;
