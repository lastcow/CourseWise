import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { ApiClientError } from '@/lib/api';
import { useResetPassword } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';

const MIN_PASSWORD_LENGTH = 8;

// Server token-error codes that mean the reset link can no longer be used.
// Any of these flips the page into the invalid-link state.
const INVALID_TOKEN_CODES = new Set(['INVALID_TOKEN', 'TOKEN_EXPIRED', 'TOKEN_REVOKED']);

function InvalidLink(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('passwordReset.invalidLinkTitle')}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('passwordReset.invalidLinkBody')}</p>
      <Link
        to="/forgot-password"
        className="mt-6 block text-center text-sm text-muted-foreground hover:underline"
      >
        {t('passwordReset.requestNewLink')}
      </Link>
    </div>
  );
}

export function ResetPasswordPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const resetPassword = useResetPassword();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);

  if (!token || invalidLink) {
    return (
      <SectionBand>
        <Container>
          <div className="mx-auto max-w-md rounded-2xl border bg-white p-8">
            <InvalidLink />
          </div>
        </Container>
      </SectionBand>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    if (password !== confirm) {
      setErrorKey('passwordReset.mismatch');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorKey('errors.field.too_small');
      return;
    }
    try {
      await resetPassword.mutateAsync({ token, password });
      toast.push({ title: t('passwordReset.successToast'), tone: 'success' });
      navigate('/login');
    } catch (err) {
      if (err instanceof ApiClientError && INVALID_TOKEN_CODES.has(err.error.code)) {
        setInvalidLink(true);
        return;
      }
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      setErrorKey(i18n);
    }
  };

  return (
    <SectionBand>
      <Container>
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-8">
          <div className="mb-6 text-center">
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {t('passwordReset.newTitle')}
            </h1>
          </div>
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password">{t('passwordReset.newPasswordLabel')}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">{t('passwordReset.confirmLabel')}</Label>
              <Input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {errorKey ? <p className="text-sm text-destructive">{t(errorKey)}</p> : null}
            <Button disabled={resetPassword.isPending} type="submit" className="w-full">
              {resetPassword.isPending ? t('common.loading') : t('passwordReset.submitCta')}
            </Button>
          </form>
        </div>
      </Container>
    </SectionBand>
  );
}
