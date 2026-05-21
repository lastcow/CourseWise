import { Hono } from 'hono';
import { contactMessageSchema, type ContactMessageInput } from '@coursewise/shared';
import { success } from '../lib/response';
import { validateJson } from '../middleware/validate';
import type { AppEnv } from '../types';

const contact = new Hono<AppEnv>();

contact.post('/contact', validateJson(contactMessageSchema), async (c) => {
  const input = c.get('validated') as ContactMessageInput;
  // We log only non-PII signal so the operator can tell a submission landed
  // without leaking the sender's name, email, institution, or message body
  // into Cloudflare Worker logs (those have their own retention outside our
  // direct control — see FERPA roadmap item #6).
  //
  // TODO: replace this stub with a real ticket queue (DB table or email
  // relay) so the submission can actually be read and answered. Until then
  // the message is intentionally dropped after validation.
  console.log('contact.message', {
    subject: input.subject,
    hasInstitution: input.institution != null && input.institution.length > 0,
    messageLength: input.message.length,
  });
  return success(c, { received: true });
});

export default contact;
