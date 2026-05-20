import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { useAuth } from '@/lib/authContext';
import { ApiClientError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

// Only honor redirectTo values that point to same-origin paths. Reject anything
// that could escape the app (full URLs, protocol-relative `//evil.com`, etc.).
function isSafeRedirect(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  return raw;
}

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    try {
      const next = await login(email, password);
      toast.push({ title: t('auth.welcomeBack'), description: next.user.email, tone: 'success' });
      const redirectTo = isSafeRedirect(searchParams.get('redirectTo'));
      const home =
        redirectTo ??
        (next.user.role === 'admin'
          ? '/admin/courses'
          : next.user.role === 'teacher'
            ? '/teacher/courses'
            : '/student/courses');
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
          <div className="mb-6 text-center">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Sign in
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Welcome back.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Use your school email and password.
            </p>
          </div>
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
