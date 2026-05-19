import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TeacherInvitationLookup } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { ApiClientError } from '@/lib/api';
import { lookupTeacherInvitation } from '@/lib/queries';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/toast';

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
    <SectionBand>
      <Container>
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-8">
          <div className="mb-6 text-center">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Teacher invitation
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Join your school on CourseWise.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Complete the steps below to claim your teacher account.
            </p>
          </div>
          {lookup.status === 'loading' ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : lookup.status === 'error' ? (
            <div className="mt-8 space-y-4">
              <p className="text-sm text-destructive">{t(lookup.i18nKey)}</p>
              <p className="text-sm text-muted-foreground">{t('teacherInvite.requestNew')}</p>
              <div className="flex items-center justify-between">
                <Link to="/" className="text-sm text-muted-foreground hover:underline">
                  {t('nav.home')}
                </Link>
                <Link to="/login" className="text-sm hover:underline">
                  {t('auth.loginCta')}
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('teacherInvite.invitedBy', { name: lookup.data.inviterName })}
              </p>
              <div className="space-y-1">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input id="email" type="email" value={lookup.data.email} readOnly disabled />
              </div>
              <div className="space-y-1">
                <Label htmlFor="name">{t('auth.name')}</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('teacherInvite.expiresAt', {
                  date: new Date(lookup.data.expiresAt).toLocaleString(),
                })}
              </p>
              {submitErrorKey ? (
                <p className="text-sm text-destructive">{t(submitErrorKey)}</p>
              ) : null}
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? t('common.loading') : t('teacherInvite.cta')}
              </Button>
            </form>
          )}
        </div>
      </Container>
    </SectionBand>
  );
}
