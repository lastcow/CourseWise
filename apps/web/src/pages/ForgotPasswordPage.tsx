import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { useForgotPassword } from '@/lib/queries';

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
    <SectionBand>
      <Container>
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-8">
          {done ? (
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t('passwordReset.requestDoneTitle')}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('passwordReset.requestDoneBody')}
              </p>
              <Link
                to="/login"
                className="mt-6 block text-center text-sm text-muted-foreground hover:underline"
              >
                {t('auth.loginCta')}
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center">
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                  {t('passwordReset.requestTitle')}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('passwordReset.requestSubtitle')}
                </p>
              </div>
              <form onSubmit={onSubmit} className="mt-8 space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="email">{t('passwordReset.emailLabel')}</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button disabled={forgotPassword.isPending} type="submit" className="w-full">
                  {forgotPassword.isPending ? t('common.loading') : t('passwordReset.requestCta')}
                </Button>
                <Link
                  to="/login"
                  className="block text-center text-sm text-muted-foreground hover:underline"
                >
                  {t('auth.loginCta')}
                </Link>
              </form>
            </>
          )}
        </div>
      </Container>
    </SectionBand>
  );
}
