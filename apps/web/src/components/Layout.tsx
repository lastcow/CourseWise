import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/toast';

export function Layout(): JSX.Element {
  const { t } = useTranslation();
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const onLogout = async () => {
    await logout();
    toast.push({ title: t('auth.logoutSuccess'), tone: 'success' });
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="text-base font-semibold">
            {t('app.name')}
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {auth?.user.role === 'admin' ? (
              <>
                <Link className="px-3 py-1 hover:underline" to="/admin/dashboard">
                  {t('nav.dashboard')}
                </Link>
                <Link className="px-3 py-1 hover:underline" to="/admin/courses">
                  {t('nav.adminCourses')}
                </Link>
                <Link className="px-3 py-1 hover:underline" to="/admin/alerts">
                  {t('nav.alerts')}
                </Link>
                <Link className="px-3 py-1 hover:underline" to="/admin/invitation-codes">
                  {t('nav.invitationCodes')}
                </Link>
              </>
            ) : null}
            {auth?.user.role === 'teacher' ? (
              <Link className="px-3 py-1 hover:underline" to="/teacher/courses">
                {t('nav.courses')}
              </Link>
            ) : null}
            {auth?.user.role === 'student' ? (
              <>
                <Link className="px-3 py-1 hover:underline" to="/student/dashboard">
                  {t('nav.dashboard')}
                </Link>
                <Link className="px-3 py-1 hover:underline" to="/student/courses">
                  {t('nav.courses')}
                </Link>
              </>
            ) : null}
            {auth ? (
              <Button size="sm" variant="outline" onClick={onLogout}>
                {t('nav.logout')}
              </Button>
            ) : (
              <Link to="/login" className="px-3 py-1 hover:underline">
                {t('auth.loginCta')}
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
