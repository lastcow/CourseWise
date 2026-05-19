import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { contactMessageSchema } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';
import { useToast } from '@/components/ui/toast';
import { apiCall } from '@/lib/api';

export function ContactPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const candidate = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      institution: String(form.get('institution') ?? '') || undefined,
      subject: String(form.get('subject') ?? 'sales'),
      message: String(form.get('message') ?? ''),
    };
    const parsed = contactMessageSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.push({ title: 'Please complete all required fields.', tone: 'error' });
      return;
    }
    setPending(true);
    try {
      await apiCall<{ received: boolean }>('/api/contact', {
        method: 'POST',
        body: parsed.data,
        auth: false,
      });
      setDone(true);
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SectionBand>
        <PageHeader
          eyebrow="Contact"
          title="We answer fast."
          subtitle="Pick the right intake — sales and product questions here, FERPA record requests below."
        />
        <Container className="mt-12 grid gap-12 md:grid-cols-[1fr_360px]">
          <Reveal>
            {done ? (
              <div className="rounded-2xl border bg-white p-8 text-center">
                <h2 className="text-xl font-semibold">Thanks — we got it.</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  We respond within 1 business day during the school year. For urgent matters, reach us directly.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border bg-white p-8">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="c-name">Name</Label>
                    <Input id="c-name" name="name" required maxLength={120} />
                  </div>
                  <div>
                    <Label htmlFor="c-email">Email</Label>
                    <Input id="c-email" name="email" type="email" required maxLength={200} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="c-inst">Institution (optional)</Label>
                  <Input id="c-inst" name="institution" maxLength={200} />
                </div>
                <div>
                  <Label htmlFor="c-subject">Reason</Label>
                  <select
                    id="c-subject"
                    name="subject"
                    required
                    className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="sales">Sales / general</option>
                    <option value="support">Existing customer support</option>
                    <option value="press">Press</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="c-msg">Message</Label>
                  <Textarea id="c-msg" name="message" required rows={6} maxLength={4000} />
                </div>
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? 'Sending…' : 'Send message'}
                </Button>
              </form>
            )}
          </Reveal>
          <aside className="space-y-6 text-sm text-muted-foreground">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em]">Response time</div>
              <p className="mt-2">
                1 business day during the school year. 3 business days during summer and holiday breaks.
              </p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em]">FERPA data requests</div>
              <p className="mt-2">
                If you're a parent, eligible student, or institutional records officer requesting inspection,
                amendment, or deletion of education records, use the dedicated intake:{' '}
                <Link to="/legal/data-requests" className="underline">
                  Data Requests
                </Link>
                .
              </p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em]">Security disclosure</div>
              <p className="mt-2">
                Report vulnerabilities via{' '}
                <Link to="/legal/responsible-disclosure" className="underline">
                  Responsible Disclosure
                </Link>
                . We honor a 90-day safe harbor.
              </p>
            </div>
          </aside>
        </Container>
      </SectionBand>
    </>
  );
}
