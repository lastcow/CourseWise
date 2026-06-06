import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/lib/authContext';
import { Container } from './Container';
import { BrandMark } from './BrandMark';
import { cn } from '@/lib/utils';

// Evergreen primary CTA, overriding the back-office's dark-navy Button default.
const CTA = 'bg-evergreen text-paper hover:bg-evergreen-dark';

const ITEMS: { to: string; label: string }[] = [
  { to: '/features', label: 'public.nav.features' },
  { to: '/pricing', label: 'public.nav.pricing' },
  { to: '/about', label: 'public.nav.about' },
];

export function PublicHeader(): JSX.Element {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-close the mobile menu when the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function renderLink(item: { to: string; label: string }, isMobile: boolean): JSX.Element {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end
        className={({ isActive }) =>
          cn(
            'rounded-md px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
            isActive ? 'font-medium text-ink' : 'text-ink/60 hover:text-ink',
            isMobile && 'block',
          )
        }
        aria-current={pathname === item.to ? 'page' : undefined}
      >
        {t(item.label)}
      </NavLink>
    );
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 transition-colors',
        scrolled || mobileOpen
          ? 'border-b border-ink/10 bg-paper/85 backdrop-blur'
          : 'bg-transparent',
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-lg font-semibold tracking-tight">
            {t('app.name')}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-2 text-sm md:flex">
          {ITEMS.map((i) => renderLink(i, false))}
          <LanguageSwitcher />
          {auth ? (
            <Button asChild size="sm" className={CTA}>
              <Link to="/dashboard">{t('public.nav.dashboard')}</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="text-ink/70 hover:bg-ink/5">
                <Link to="/login">{t('public.nav.signin')}</Link>
              </Button>
              <Button asChild size="sm" className={CTA}>
                <Link to="/register">{t('public.nav.getStarted')}</Link>
              </Button>
            </>
          )}
        </nav>

        {/* Mobile menu trigger */}
        <button
          type="button"
          className="rounded-md p-2 md:hidden"
          aria-expanded={mobileOpen}
          aria-controls="public-mobile-nav"
          aria-label={t(mobileOpen ? 'public.nav.close' : 'public.nav.open')}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </Container>

      {/* Mobile panel */}
      {mobileOpen ? (
        <div
          id="public-mobile-nav"
          className="border-t border-ink/10 bg-paper/95 backdrop-blur md:hidden"
        >
          <Container className="space-y-3 py-4 text-sm">
            <nav className="flex flex-col gap-1">
              {ITEMS.map((i) => renderLink(i, true))}
            </nav>
            <div className="flex items-center justify-between gap-2 border-t border-ink/10 pt-3">
              <LanguageSwitcher />
              {auth ? (
                <Button asChild size="sm" className={CTA}>
                  <Link to="/dashboard">{t('public.nav.dashboard')}</Link>
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="ghost" className="text-ink/70 hover:bg-ink/5">
                    <Link to="/login">{t('public.nav.signin')}</Link>
                  </Button>
                  <Button asChild size="sm" className={CTA}>
                    <Link to="/register">{t('public.nav.getStarted')}</Link>
                  </Button>
                </div>
              )}
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
