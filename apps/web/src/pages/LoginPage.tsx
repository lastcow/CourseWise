import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useAuth } from '@/lib/authContext';
import { ApiClientError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    try {
      const next = await login(email, password);
      toast.push({ title: t('auth.welcomeBack'), description: next.user.email, tone: 'success' });
      const home =
        next.user.role === 'admin'
          ? '/admin/courses'
          : next.user.role === 'teacher'
            ? '/teacher/courses'
            : '/student/courses';
      navigate(home);
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      setErrorKey(i18n);
    }
  };

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.loginTitle')}</CardTitle>
          <CardDescription>{t('app.tagline')}</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {errorKey ? <p className="text-sm text-destructive">{t(errorKey)}</p> : null}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2">
            <Button disabled={isLoading} type="submit">
              {isLoading ? t('common.loading') : t('auth.loginCta')}
            </Button>
            <Link to="/register" className="text-center text-sm text-muted-foreground hover:underline">
              {t('auth.switchToRegister')}
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
