import { Link, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header
      className={cn(
        'sticky top-0 z-30 transition-colors',
        scrolled ? 'border-b bg-white/80 backdrop-blur' : 'bg-transparent',
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" className="text-base font-semibold tracking-tight">
          {t('app.name')}
        </Link>
        <nav className="hidden items-center gap-2 text-sm md:flex">
          {ITEMS.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                cn('px-3 py-1.5 rounded-md hover:bg-black/5', isActive && 'text-foreground font-medium')
              }
            >
              {t(i.label)}
            </NavLink>
          ))}
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
      </Container>
    </header>
  );
}
