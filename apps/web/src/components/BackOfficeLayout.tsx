import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { MessageBell } from '@/components/messaging/MessageBell';
import { SideNav, type UserRole } from '@/components/SideNav';
import { useEscapeToClose, useSideNavCollapsed } from '@/components/sideNavHooks';
import { useAuth } from '@/lib/authContext';
import { useCourse } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type BackOfficeLayoutProps = {
  role: UserRole;
};

export function BackOfficeLayout({ role }: BackOfficeLayoutProps): JSX.Element {
  const { t } = useTranslation();
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();

  const [collapsed, setCollapsed] = useSideNavCollapsed();
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEscapeToClose(mobileOpen, () => setMobileOpen(false));

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (!mobileOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileOpen]);

  const onLogout = async (): Promise<void> => {
    await logout();
    toast.push({ title: t('auth.logoutSuccess'), tone: 'success' });
    navigate('/login');
  };

  // Active course label for the top-bar center slot. Mirrors the same
  // course-route detection the SideNav uses so the header and sidebar
  // stay in sync about "which course am I in?". Skips the /new sentinel
  // so the header doesn't flash during the create-course flow.
  const teacherCourseMatch = useMatch('/teacher/courses/:courseId/*');
  const studentCourseMatch = useMatch('/student/courses/:courseId/*');
  const teacherCourseId = teacherCourseMatch?.params.courseId;
  const studentCourseId = studentCourseMatch?.params.courseId;
  const activeCourseId =
    teacherCourseId && teacherCourseId !== 'new'
      ? teacherCourseId
      : studentCourseId ?? null;
  const activeCourse = useCourse(activeCourseId);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          'hidden md:sticky md:top-0 md:flex md:h-screen md:shrink-0 md:border-r',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'md:w-16' : 'md:w-64',
        )}
      >
        <SideNav
          role={role}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(!collapsed)}
        />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t('nav.closeMenu')}
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 border-r bg-card shadow-lg">
            <SideNav
              role={role}
              collapsed={false}
              onToggleCollapsed={() => setCollapsed(!collapsed)}
              variant="mobile"
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="relative flex h-14 items-center justify-between gap-2 px-4">
            {activeCourse.data ? (
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 hidden max-w-[40%] -translate-x-1/2 -translate-y-1/2 truncate text-sm font-medium md:block"
                title={`${activeCourse.data.code} – ${activeCourse.data.title}`}
              >
                <span className="font-mono text-muted-foreground">
                  {activeCourse.data.code}
                </span>
                <span className="mx-1.5 text-muted-foreground">–</span>
                <span>{activeCourse.data.title}</span>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label={t('nav.openMenu')}
                aria-expanded={mobileOpen}
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
              <Link to="/" className="text-base font-semibold md:hidden">
                {t('app.name')}
              </Link>
              <Link
                to="/dashboard"
                className="hidden items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
              >
                <Home className="h-4 w-4" aria-hidden />
                <span>{t('nav.home')}</span>
              </Link>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {auth ? (
                <>
                  <span className="hidden text-muted-foreground sm:inline">
                    {auth.user.name}
                  </span>
                  <MessageBell enabled={!!auth} />
                  <LanguageSwitcher />
                  <Button size="sm" variant="outline" onClick={onLogout}>
                    {t('nav.logout')}
                  </Button>
                </>
              ) : (
                <>
                  <LanguageSwitcher />
                  <Link to="/login" className="px-3 py-1 hover:underline">
                    {t('auth.loginCta')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
