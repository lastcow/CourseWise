import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/authContext';

export function HomePage(): JSX.Element {
  const { t } = useTranslation();
  const { auth } = useAuth();
  if (auth) {
    const home =
      auth.user.role === 'admin'
        ? '/admin/courses'
        : auth.user.role === 'teacher'
          ? '/teacher/courses'
          : '/student/courses';
    return <Navigate to={home} replace />;
  }
  return (
    <section className="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{t('app.name')}</h1>
      <p className="text-muted-foreground">{t('app.tagline')}</p>
      <div className="flex gap-2">
        <Button asChild>
          <Link to="/login">{t('auth.loginCta')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/register">{t('auth.registerCta')}</Link>
        </Button>
      </div>
    </section>
  );
}
