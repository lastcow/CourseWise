import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/authContext';
import { ApiClientError } from '@/lib/api';
import { useCanvasConnection, useConnectCanvas, useDisconnectCanvas } from '@/lib/queries';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export function SettingsIntegrationsPage(): JSX.Element {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const role = auth?.user.role;
  const isTeacher = role === 'teacher' || role === 'admin';

  const connectionQ = useCanvasConnection(isTeacher);
  const connectMutation = useConnectCanvas();
  const disconnectMutation = useDisconnectCanvas();

  // Re-shows the connect form over an existing (dead) connection.
  const [showForm, setShowForm] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://');
  const [token, setToken] = useState('');
  const [connectErrorKey, setConnectErrorKey] = useState<string | null>(null);
  // Server messages carry the Canvas-specific reason (token invalid / expired /
  // revoked, unreachable base URL) — shown under the translated error.
  const [connectErrorDetail, setConnectErrorDetail] = useState<string | null>(null);

  const connection = connectionQ.data ?? null;
  const formVisible = !connection || showForm;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectErrorKey(null);
    setConnectErrorDetail(null);
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, '');
    let parsed: URL | null = null;
    try {
      parsed = new URL(trimmedUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname.includes('.')) {
      setConnectErrorKey('settings.integrations.canvas.baseUrlInvalid');
      return;
    }
    const trimmedToken = token.trim();
    if (trimmedToken.length < 20) {
      setConnectErrorKey('settings.integrations.canvas.tokenTooShort');
      return;
    }
    try {
      await connectMutation.mutateAsync({ baseUrl: trimmedUrl, token: trimmedToken });
      toast.push({ title: t('settings.integrations.canvas.connected'), tone: 'success' });
      setShowForm(false);
      setBaseUrl('https://');
      setToken('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      setConnectErrorKey(key);
      setConnectErrorDetail(err instanceof ApiClientError ? err.error.message : null);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    const ok = await confirm({
      title: t('settings.integrations.canvas.disconnectTitle'),
      description: t('settings.integrations.canvas.disconnectBody'),
      detail: {
        name: connection.baseUrl,
        facts: [
          {
            label: t('settings.integrations.canvas.accountLabel'),
            value: connection.externalUserName ?? connection.externalUserId ?? '—',
          },
          {
            label: t('settings.integrations.canvas.tokenValue'),
            value: `••••${connection.tokenLast4}`,
          },
        ],
      },
      confirmLabel: t('settings.integrations.canvas.disconnectCta'),
    });
    if (!ok) return;
    try {
      const res = await disconnectMutation.mutateAsync();
      toast.push({
        title: t('settings.integrations.canvas.disconnected'),
        description: res.remoteRevoked
          ? t('settings.integrations.canvas.disconnectedRemote')
          : t('settings.integrations.canvas.disconnectedManualHint'),
        tone: 'success',
      });
      setShowForm(false);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('settings.integrations.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t('settings.integrations.description')}
        </p>
      </div>

      {!isTeacher ? (
        <p className="text-sm text-muted-foreground">{t('settings.integrations.teacherOnly')}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-4 w-4" aria-hidden />
              {t('settings.integrations.canvas.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('settings.integrations.canvas.description')}
            </p>

            {connectionQ.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : (
              <>
                {connection ? (
                  <>
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {connection.externalUserName ?? connection.externalUserId ?? '—'}
                        </span>
                        <Badge
                          variant={connection.status === 'active' ? 'success' : 'destructive'}
                        >
                          {t(`settings.integrations.canvas.status.${connection.status}`)}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">{connection.baseUrl}</div>
                      <div className="text-muted-foreground">
                        {t('settings.integrations.canvas.tokenValue')}:{' '}
                        <span className="font-mono">••••{connection.tokenLast4}</span>
                      </div>
                      {connection.tokenExpiresAt ? (
                        <div className="text-muted-foreground">
                          {t('settings.integrations.canvas.tokenExpires', {
                            date: formatDate(connection.tokenExpiresAt),
                          })}
                        </div>
                      ) : null}
                    </div>

                    {connection.status !== 'active' ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        {t('settings.integrations.canvas.reconnectHint')}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {!showForm ? (
                        <Button variant="outline" onClick={() => setShowForm(true)}>
                          {t('settings.integrations.canvas.reconnectCta')}
                        </Button>
                      ) : null}
                      <Button
                        variant="destructive"
                        onClick={() => void handleDisconnect()}
                        disabled={disconnectMutation.isPending}
                      >
                        {disconnectMutation.isPending
                          ? t('common.loading')
                          : t('settings.integrations.canvas.disconnectCta')}
                      </Button>
                    </div>
                  </>
                ) : null}

                {formVisible ? (
                  <form onSubmit={handleConnect} className="space-y-4 border-t pt-4 first:border-t-0 first:pt-0">
                    <div className="space-y-1">
                      <Label htmlFor="canvas-base-url">
                        {t('settings.integrations.canvas.baseUrlLabel')}
                      </Label>
                      <Input
                        id="canvas-base-url"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://school.instructure.com"
                        maxLength={500}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('settings.integrations.canvas.baseUrlHelp')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="canvas-token">
                        {t('settings.integrations.canvas.tokenLabel')}
                      </Label>
                      <Input
                        id="canvas-token"
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className="font-mono text-xs"
                        autoComplete="off"
                        maxLength={500}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('settings.integrations.canvas.tokenHelp')}
                      </p>
                    </div>
                    {connectErrorKey ? (
                      <p className="text-sm text-destructive">
                        {t(connectErrorKey)}
                        {connectErrorDetail ? (
                          <span className="mt-0.5 block text-xs opacity-80">
                            {connectErrorDetail}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-2 pt-2">
                      {connection ? (
                        <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                          {t('common.cancel')}
                        </Button>
                      ) : null}
                      <Button type="submit" disabled={connectMutation.isPending}>
                        {connectMutation.isPending
                          ? t('common.loading')
                          : t('settings.integrations.canvas.connectCta')}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
