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

export function RegisterPage(): JSX.Element {
  const { t } = useTranslation();
  const { register, isLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const initialInvitationCode = params.get('invitationCode') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [invitationCode, setInvitationCode] = useState(initialInvitationCode);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const signInHref = invitationCode
    ? `/login?redirectTo=${encodeURIComponent(`/invite/${invitationCode}`)}`
    : '/login';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    try {
      const next = await register({ email, password, name, invitationCode });
      toast.push({ title: t('auth.welcomeBack'), description: next.user.email, tone: 'success' });
      navigate('/student/courses');
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      setErrorKey(i18n);
    }
  };

  return (
    <AuthShell>
      <AuthHeading
        eyebrow="Get started"
        title="Create your workspace."
        subtitle="Free for educators — a couple of minutes to your first AI-drafted material."
      />
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t('auth.name')}</Label>
          <Input
            id="name"
            required
            autoComplete="name"
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
          <Label htmlFor="password">{t('auth.password')}</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={FIELD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invitationCode">{t('auth.invitationCode')}</Label>
          <Input
            id="invitationCode"
            required
            className={FIELD}
            value={invitationCode}
            onChange={(e) => setInvitationCode(e.target.value)}
          />
        </div>
        {errorKey ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t(errorKey)}
          </p>
        ) : null}
        <Button disabled={isLoading} type="submit" className={SUBMIT}>
          {isLoading ? t('common.loading') : t('auth.registerCta')}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-ink-400">
        <Link to={signInHref} className="font-medium text-ink transition-colors hover:text-evergreen">
          {t('auth.switchToLogin')}
        </Link>
        <span className="mx-2 text-ink/40" aria-hidden>
          ·
        </span>
        <Link to="/features" className="transition-colors hover:text-evergreen">
          Why CourseWise?
        </Link>
      </p>
    </AuthShell>
  );
}
