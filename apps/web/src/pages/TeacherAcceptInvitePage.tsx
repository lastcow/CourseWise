import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TeacherInvitationLookup } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { AuthShell, AuthHeading } from '@/components/public/AuthShell';
import { ApiClientError } from '@/lib/api';
import { lookupTeacherInvitation } from '@/lib/queries';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/toast';

const FIELD = 'h-11 focus-visible:ring-evergreen';
const SUBMIT = 'h-11 w-full bg-evergreen text-paper hover:bg-evergreen-dark';

type LookupState =
  | { status: 'loading' }
  | { status: 'ready'; data: TeacherInvitationLookup }
  | { status: 'error'; i18nKey: string };

export function TeacherAcceptInvitePage(): JSX.Element {
  const { t } = useTranslation();
  const { registerTeacher, isLoading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = params.get('token') ?? '';
  const [lookup, setLookup] = useState<LookupState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitErrorKey, setSubmitErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLookup({ status: 'error', i18nKey: 'errors.invalidInvitation' });
      return;
    }
    lookupTeacherInvitation(token)
      .then((data) => {
        if (cancelled) return;
        setLookup({ status: 'ready', data });
      })
      .catch((err) => {
        if (cancelled) return;
        const i18nKey = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
        setLookup({ status: 'error', i18nKey });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErrorKey(null);
    try {
      const next = await registerTeacher({ token, name, password });
      toast.push({ title: t('auth.welcomeBack'), description: next.user.email, tone: 'success' });
      navigate('/teacher/courses', { replace: true });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      setSubmitErrorKey(i18n);
    }
  }

  return (
    <AuthShell>
      <AuthHeading
        eyebrow="Teacher invitation"
        title="Join your school on CourseWise."
        subtitle="Complete the steps below to claim your teacher account."
      />
      {lookup.status === 'loading' ? (
        <p className="text-sm text-ink-400">{t('common.loading')}</p>
      ) : lookup.status === 'error' ? (
        <div className="space-y-4">
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t(lookup.i18nKey)}
          </p>
          <p className="text-sm text-ink-400">{t('teacherInvite.requestNew')}</p>
          <div className="flex items-center justify-between pt-2 text-sm">
            <Link to="/" className="text-ink-400 transition-colors hover:text-evergreen">
              {t('nav.home')}
            </Link>
            <Link to="/login" className="font-medium text-ink transition-colors hover:text-evergreen">
              {t('auth.loginCta')}
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="rounded-md border border-evergreen-200 bg-evergreen-100 px-3 py-2 text-sm text-evergreen">
            {t('teacherInvite.invitedBy', { name: lookup.data.inviterName })}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              value={lookup.data.email}
              readOnly
              disabled
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">{t('auth.name')}</Label>
            <Input
              id="name"
              required
              className={FIELD}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              className={FIELD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <p className="text-xs text-ink-400">
            {t('teacherInvite.expiresAt', {
              date: new Date(lookup.data.expiresAt).toLocaleString(),
            })}
          </p>
          {submitErrorKey ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {t(submitErrorKey)}
            </p>
          ) : null}
          <Button type="submit" disabled={isLoading} className={SUBMIT}>
            {isLoading ? t('common.loading') : t('teacherInvite.cta')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
