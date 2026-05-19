import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { useAuth } from '@/lib/authContext';
import { ApiClientError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export function RegisterPage(): JSX.Element {
  const { t } = useTranslation();
  const { register, isLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);

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
    <SectionBand>
      <Container>
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-8">
          <div className="mb-6 text-center">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Get started
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Create your workspace.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Free for educators. 60 seconds to your first AI-drafted material.
            </p>
          </div>
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">{t('auth.name')}</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invitationCode">{t('auth.invitationCode')}</Label>
              <Input id="invitationCode" required value={invitationCode} onChange={(e) => setInvitationCode(e.target.value)} />
            </div>
            {errorKey ? <p className="text-sm text-destructive">{t(errorKey)}</p> : null}
            <Button disabled={isLoading} type="submit" className="w-full">
              {isLoading ? t('common.loading') : t('auth.registerCta')}
            </Button>
            <Link
              to="/login"
              className="block text-center text-sm text-muted-foreground hover:underline"
            >
              {t('auth.switchToLogin')}
            </Link>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link to="/features" className="underline">Why CourseWise?</Link>
          </p>
        </div>
      </Container>
    </SectionBand>
  );
}
