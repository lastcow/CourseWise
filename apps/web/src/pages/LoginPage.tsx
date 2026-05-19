import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Container } from '@/components/public/Container';
import { PageHeader } from '@/components/public/PageHeader';
import { SectionBand } from '@/components/public/SectionBand';
import { useAuth } from '@/lib/authContext';
import { ApiClientError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    try {
      const next = await login(email, password);
      toast.push({ title: t('auth.welcomeBack'), description: next.user.email, tone: 'success' });
      const home =
        next.user.role === 'admin'
          ? '/admin/courses'
          : next.user.role === 'teacher'
            ? '/teacher/courses'
            : '/student/courses';
      navigate(home);
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      setErrorKey(i18n);
    }
  };

  return (
    <SectionBand>
      <Container>
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-8">
          <PageHeader
            eyebrow="Sign in"
            title="Welcome back."
            subtitle="Use your school email and password."
            align="center"
          />
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {errorKey ? <p className="text-sm text-destructive">{t(errorKey)}</p> : null}
            <Button disabled={isLoading} type="submit" className="w-full">
              {isLoading ? t('common.loading') : t('auth.loginCta')}
            </Button>
            <Link
              to="/register"
              className="block text-center text-sm text-muted-foreground hover:underline"
            >
              {t('auth.switchToRegister')}
            </Link>
          </form>
        </div>
      </Container>
    </SectionBand>
  );
}
