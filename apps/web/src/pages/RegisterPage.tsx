import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
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
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.registerTitle')}</CardTitle>
          <CardDescription>{t('app.tagline')}</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
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
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2">
            <Button disabled={isLoading} type="submit">
              {isLoading ? t('common.loading') : t('auth.registerCta')}
            </Button>
            <Link to="/login" className="text-center text-sm text-muted-foreground hover:underline">
              {t('auth.switchToLogin')}
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
