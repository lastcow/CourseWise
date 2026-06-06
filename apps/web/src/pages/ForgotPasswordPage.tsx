import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { AuthShell, AuthHeading } from '@/components/public/AuthShell';
import { useForgotPassword } from '@/lib/queries';

const FIELD = 'h-11 focus-visible:ring-evergreen';
const SUBMIT = 'h-11 w-full bg-evergreen text-paper hover:bg-evergreen-dark';

export function ForgotPasswordPage(): JSX.Element {
  const { t } = useTranslation();
  const forgotPassword = useForgotPassword();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await forgotPassword.mutateAsync(email);
    } catch {
      // Enumeration-safe: never reveal whether the email maps to an account.
      // Show the same confirmation regardless of success or failure.
    }
    setDone(true);
  };

  return (
    <AuthShell>
      {done ? (
        <div>
          <AuthHeading
            title={t('passwordReset.requestDoneTitle')}
            subtitle={t('passwordReset.requestDoneBody')}
          />
          <Link
            to="/login"
            className="text-sm font-medium text-ink transition-colors hover:text-evergreen"
          >
            ← {t('auth.loginCta')}
          </Link>
        </div>
      ) : (
        <>
          <AuthHeading
            eyebrow="Reset"
            title={t('passwordReset.requestTitle')}
            subtitle={t('passwordReset.requestSubtitle')}
          />
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('passwordReset.emailLabel')}</Label>
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
            <Button disabled={forgotPassword.isPending} type="submit" className={SUBMIT}>
              {forgotPassword.isPending ? t('common.loading') : t('passwordReset.requestCta')}
            </Button>
          </form>
          <p className="mt-8 text-center text-sm text-ink-400">
            <Link to="/login" className="font-medium text-ink transition-colors hover:text-evergreen">
              {t('auth.loginCta')}
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
