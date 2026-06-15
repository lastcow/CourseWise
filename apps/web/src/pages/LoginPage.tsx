import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { AuthShell, AuthHeading } from '@/components/public/AuthShell';
import { useAuth } from '@/lib/authContext';
import { ApiClientError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const FIELD = 'h-11 focus-visible:ring-evergreen';
const SUBMIT = 'h-11 w-full bg-evergreen text-paper hover:bg-evergreen-dark';

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
  const [rememberMe, setRememberMe] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    try {
      const next = await login(email, password, rememberMe);
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
    <AuthShell>
      <AuthHeading eyebrow="Sign in" title="Welcome back." subtitle="Use your school email and password." />
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            className={FIELD}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-evergreen hover:underline"
            >
              {t('auth.forgotPasswordLink')}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className={FIELD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="rememberMe"
            type="checkbox"
            className="h-4 w-4 cursor-pointer rounded border-input accent-evergreen focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen focus-visible:ring-offset-2"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <Label htmlFor="rememberMe" className="cursor-pointer font-normal text-ink-400">
            {t('auth.rememberMe')}
          </Label>
        </div>
        {errorKey ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t(errorKey)}
          </p>
        ) : null}
        <Button disabled={isLoading} type="submit" className={SUBMIT}>
          {isLoading ? t('common.loading') : t('auth.loginCta')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-ink-400">
        <Link to="/register" className="font-medium text-ink transition-colors hover:text-evergreen">
          {t('auth.switchToRegister')}
        </Link>
      </p>
    </AuthShell>
  );
}
