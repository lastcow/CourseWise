import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Container } from './Container';

const COLUMNS: { headingKey: string; links: { to: string; labelKey: string }[] }[] = [
  {
    headingKey: 'public.footer.product',
    links: [
      { to: '/features', labelKey: 'public.nav.features' },
      { to: '/pricing', labelKey: 'public.nav.pricing' },
    ],
  },
  {
    headingKey: 'public.footer.company',
    links: [
      { to: '/about', labelKey: 'public.nav.about' },
      { to: '/contact', labelKey: 'public.nav.contact' },
    ],
  },
  {
    headingKey: 'public.footer.trust',
    links: [
      { to: '/legal/security', labelKey: 'public.legal.security' },
      { to: '/legal/subprocessors', labelKey: 'public.legal.subprocessors' },
      { to: '/legal/dpa', labelKey: 'public.legal.dpa' },
      { to: '/legal/responsible-disclosure', labelKey: 'public.legal.responsibleDisclosure' },
    ],
  },
  {
    headingKey: 'public.footer.legal',
    links: [
      { to: '/legal/privacy', labelKey: 'public.legal.privacy' },
      { to: '/legal/terms', labelKey: 'public.legal.terms' },
      { to: '/legal/ferpa', labelKey: 'public.legal.ferpa' },
      { to: '/legal/coppa', labelKey: 'public.legal.coppa' },
      { to: '/legal/accessibility', labelKey: 'public.legal.accessibility' },
      { to: '/legal/cookies', labelKey: 'public.legal.cookies' },
      { to: '/legal/state-addenda', labelKey: 'public.legal.stateAddenda' },
      { to: '/legal/data-requests', labelKey: 'public.legal.dataRequests' },
    ],
  },
];

export function FooterMega(): JSX.Element {
  const { t } = useTranslation();
  return (
    <footer className="border-t bg-[#fafafa]">
      <Container className="py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="text-base font-semibold tracking-tight">{t('app.name')}</div>
            <p className="mt-3 max-w-xs text-xs text-muted-foreground">
              {t('public.footer.blurb')}
            </p>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.headingKey}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t(c.headingKey)}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {c.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="hover:underline">
                      {t(l.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t pt-6 text-xs text-muted-foreground md:flex-row md:items-center">
          <div>
            © {new Date().getFullYear()} {t('app.name')}.{' '}
            {t('public.footer.rights')}
          </div>
          <LanguageSwitcher />
        </div>
      </Container>
    </footer>
  );
}
