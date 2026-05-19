import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export const LEGAL_PAGES = [
  { to: '/legal/privacy', labelKey: 'public.legal.privacy' },
  { to: '/legal/terms', labelKey: 'public.legal.terms' },
  { to: '/legal/ferpa', labelKey: 'public.legal.ferpa' },
  { to: '/legal/subprocessors', labelKey: 'public.legal.subprocessors' },
  { to: '/legal/coppa', labelKey: 'public.legal.coppa' },
  { to: '/legal/security', labelKey: 'public.legal.security' },
  { to: '/legal/data-requests', labelKey: 'public.legal.dataRequests' },
  { to: '/legal/accessibility', labelKey: 'public.legal.accessibility' },
  { to: '/legal/cookies', labelKey: 'public.legal.cookies' },
  { to: '/legal/state-addenda', labelKey: 'public.legal.stateAddenda' },
  { to: '/legal/dpa', labelKey: 'public.legal.dpa' },
  { to: '/legal/responsible-disclosure', labelKey: 'public.legal.responsibleDisclosure' },
];

export function LegalSidebar(): JSX.Element {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <select
        value={pathname}
        onChange={(e) => navigate(e.target.value)}
        className="mb-6 flex h-10 w-full rounded-md border bg-background px-3 text-sm md:hidden"
      >
        {LEGAL_PAGES.map((p) => (
          <option key={p.to} value={p.to}>{t(p.labelKey)}</option>
        ))}
      </select>
      <nav className="hidden md:block">
        <ul className="space-y-1 text-sm">
          {LEGAL_PAGES.map((p) => (
            <li key={p.to}>
              <NavLink
                to={p.to}
                className={({ isActive }) =>
                  cn(
                    'block rounded-md px-3 py-1.5',
                    isActive ? 'bg-black/5 font-medium text-foreground' : 'text-muted-foreground hover:bg-black/5',
                  )
                }
              >
                {t(p.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
