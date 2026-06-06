import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { AuthShell, AuthHeading } from '@/components/public/AuthShell';
import { ApiClientError } from '@/lib/api';
import { useResetPassword } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';

const MIN_PASSWORD_LENGTH = 8;
const FIELD = 'h-11 focus-visible:ring-evergreen';
const SUBMIT = 'h-11 w-full bg-evergreen text-paper hover:bg-evergreen-dark';

// Server token-error codes that mean the reset link can no longer be used.
// Any of these flips the page into the invalid-link state.
const INVALID_TOKEN_CODES = new Set(['INVALID_TOKEN', 'TOKEN_EXPIRED', 'TOKEN_REVOKED']);

function InvalidLink(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div>
      <AuthHeading
        title={t('passwordReset.invalidLinkTitle')}
        subtitle={t('passwordReset.invalidLinkBody')}
      />
      <Link
        to="/forgot-password"
        className="text-sm font-medium text-ink transition-colors hover:text-evergreen"
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
      <AuthShell>
        <InvalidLink />
      </AuthShell>
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
    <AuthShell>
      <AuthHeading eyebrow="Reset" title={t('passwordReset.newTitle')} />
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="password">{t('passwordReset.newPasswordLabel')}</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className={FIELD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">{t('passwordReset.confirmLabel')}</Label>
          <Input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            className={FIELD}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {errorKey ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t(errorKey)}
          </p>
        ) : null}
        <Button disabled={resetPassword.isPending} type="submit" className={SUBMIT}>
          {resetPassword.isPending ? t('common.loading') : t('passwordReset.submitCta')}
        </Button>
      </form>
    </AuthShell>
  );
}
