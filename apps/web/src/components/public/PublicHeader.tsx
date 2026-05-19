import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/lib/authContext';
import { Container } from './Container';
import { cn } from '@/lib/utils';

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
            'rounded-md px-3 py-1.5 transition-colors hover:bg-black/5',
            isActive ? 'text-foreground font-medium' : 'text-foreground/70',
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
        scrolled || mobileOpen ? 'border-b bg-white/85 backdrop-blur' : 'bg-transparent',
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" className="text-base font-semibold tracking-tight">
          {t('app.name')}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-2 text-sm md:flex">
          {ITEMS.map((i) => renderLink(i, false))}
          <LanguageSwitcher />
          {auth ? (
            <Button asChild size="sm">
              <Link to="/dashboard">{t('public.nav.dashboard')}</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/login">{t('public.nav.signin')}</Link>
              </Button>
              <Button asChild size="sm">
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
        <div id="public-mobile-nav" className="border-t bg-white/95 backdrop-blur md:hidden">
          <Container className="space-y-3 py-4 text-sm">
            <nav className="flex flex-col gap-1">
              {ITEMS.map((i) => renderLink(i, true))}
            </nav>
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <LanguageSwitcher />
              {auth ? (
                <Button asChild size="sm">
                  <Link to="/dashboard">{t('public.nav.dashboard')}</Link>
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/login">{t('public.nav.signin')}</Link>
                  </Button>
                  <Button asChild size="sm">
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
