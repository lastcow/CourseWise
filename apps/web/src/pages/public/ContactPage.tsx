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
      toast.push({ title: t('public.contact.fieldsRequired'), tone: 'error' });
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
          eyebrow={t('public.contact.eyebrow')}
          title={t('public.contact.title')}
          subtitle={t('public.contact.subtitle')}
        />
        <Container className="mt-12 grid gap-12 md:grid-cols-[1fr_360px]">
          <Reveal>
            {done ? (
              <div className="rounded-2xl border bg-white p-8 text-center">
                <h2 className="text-xl font-semibold">{t('public.contact.doneTitle')}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('public.contact.doneBody')}
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border bg-white p-8">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="c-name">{t('public.contact.nameLabel')}</Label>
                    <Input id="c-name" name="name" required maxLength={120} />
                  </div>
                  <div>
                    <Label htmlFor="c-email">{t('public.contact.emailLabel')}</Label>
                    <Input id="c-email" name="email" type="email" required maxLength={200} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="c-inst">{t('public.contact.institutionLabel')}</Label>
                  <Input id="c-inst" name="institution" maxLength={200} />
                </div>
                <div>
                  <Label htmlFor="c-subject">{t('public.contact.reasonLabel')}</Label>
                  <select
                    id="c-subject"
                    name="subject"
                    required
                    className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="sales">{t('public.contact.reasonSales')}</option>
                    <option value="support">{t('public.contact.reasonSupport')}</option>
                    <option value="press">{t('public.contact.reasonPress')}</option>
                    <option value="other">{t('public.contact.reasonOther')}</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="c-msg">{t('public.contact.messageLabel')}</Label>
                  <Textarea id="c-msg" name="message" required rows={6} maxLength={4000} />
                </div>
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? t('public.contact.sending') : t('public.contact.sendCta')}
                </Button>
              </form>
            )}
          </Reveal>
          <aside className="space-y-6 text-sm text-muted-foreground">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em]">
                {t('public.contact.asideResponseTime')}
              </div>
              <p className="mt-2">{t('public.contact.asideResponseTimeBody')}</p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em]">
                {t('public.contact.asideFerpa')}
              </div>
              <p className="mt-2">
                {t('public.contact.asideFerpaPrefix')}{' '}
                <Link to="/legal/data-requests" className="underline">
                  {t('public.contact.asideFerpaLink')}
                </Link>
                .
              </p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em]">
                {t('public.contact.asideSecurity')}
              </div>
              <p className="mt-2">
                {t('public.contact.asideSecurityPrefix')}{' '}
                <Link to="/legal/responsible-disclosure" className="underline">
                  {t('public.contact.asideSecurityLink')}
                </Link>
                {t('public.contact.asideSecuritySuffix')}
              </p>
            </div>
          </aside>
        </Container>
      </SectionBand>
    </>
  );
}
