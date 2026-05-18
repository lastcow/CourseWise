import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import type { ApiTokenSummary, CreatedApiToken } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/authContext';
import { useCreateMyApiToken, useMyApiTokens, useRevokeMyApiToken } from '@/lib/queries';
import { ApiClientError } from '@/lib/api';

type ExpiryPreset = '30' | '90' | '365' | 'never';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function tokenStatus(t: ApiTokenSummary): { variant: 'success' | 'secondary' | 'warning' | 'destructive'; key: string } {
  if (t.revokedAt) return { variant: 'destructive', key: 'settings.apiTokens.statusRevoked' };
  if (t.expiresAt && new Date(t.expiresAt).getTime() <= Date.now()) {
    return { variant: 'warning', key: 'settings.apiTokens.statusExpired' };
  }
  return { variant: 'success', key: 'settings.apiTokens.statusActive' };
}

export function SettingsApiTokensPage(): JSX.Element {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const toast = useToast();
  const tokensQuery = useMyApiTokens();
  const createMutation = useCreateMyApiToken();
  const revokeMutation = useRevokeMyApiToken();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState<ExpiryPreset>('90');
  const [createErrorKey, setCreateErrorKey] = useState<string | null>(null);

  const [pendingToken, setPendingToken] = useState<CreatedApiToken | null>(null);
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<ApiTokenSummary | null>(null);

  const tokens = useMemo(() => tokensQuery.data?.tokens ?? [], [tokensQuery.data]);

  const closeCreate = () => {
    setCreateOpen(false);
    setName('');
    setExpiry('90');
    setCreateErrorKey(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateErrorKey(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateErrorKey('settings.apiTokens.nameRequired');
      return;
    }
    try {
      const expiresInDays = expiry === 'never' ? null : Number(expiry);
      const created = await createMutation.mutateAsync({
        name: trimmed,
        expiresInDays,
      });
      setPendingToken(created);
      setCopyConfirmed(false);
      closeCreate();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      setCreateErrorKey(key);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeMutation.mutateAsync(revokeTarget.id);
      toast.push({ title: t('settings.apiTokens.revoked'), tone: 'success' });
      setRevokeTarget(null);
    } catch (err) {
      const message = err instanceof ApiClientError ? err.error.message : t('errors.internal');
      toast.push({ title: message, tone: 'error' });
    }
  };

  const copyToken = async () => {
    if (!pendingToken) return;
    try {
      await navigator.clipboard.writeText(pendingToken.token);
      setCopyConfirmed(true);
      toast.push({ title: t('common.copied'), tone: 'success' });
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    }
  };

  const role = auth?.user.role;
  const roleLabelKey =
    role === 'admin'
      ? 'settings.apiTokens.scopeAdmin'
      : role === 'teacher'
        ? 'settings.apiTokens.scopeTeacher'
        : 'settings.apiTokens.scopeStudent';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('settings.apiTokens.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('settings.apiTokens.description')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('settings.apiTokens.createCta')}
        </Button>
      </div>

      {tokensQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : tokens.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-8 w-8" aria-hidden />}
          title={t('settings.apiTokens.emptyTitle')}
          description={t('settings.apiTokens.emptyDescription')}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('settings.apiTokens.createCta')}
            </Button>
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.apiTokens.colName')}</TableHead>
                <TableHead>{t('settings.apiTokens.colScope')}</TableHead>
                <TableHead>{t('settings.apiTokens.colCreated')}</TableHead>
                <TableHead>{t('settings.apiTokens.colLastUsed')}</TableHead>
                <TableHead>{t('settings.apiTokens.colExpires')}</TableHead>
                <TableHead>{t('settings.apiTokens.colStatus')}</TableHead>
                <TableHead className="w-[80px]" aria-label={t('common.delete')} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => {
                const status = tokenStatus(token);
                const isLive = !token.revokedAt;
                return (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell>
                      <Badge variant="info">{t(roleLabelKey)}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(token.createdAt)}</TableCell>
                    <TableCell>
                      {token.lastUsedAt ? formatDate(token.lastUsedAt) : t('settings.apiTokens.neverUsed')}
                    </TableCell>
                    <TableCell>
                      {token.expiresAt ? formatDate(token.expiresAt) : t('settings.apiTokens.noExpiry')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{t(status.key)}</Badge>
                    </TableCell>
                    <TableCell>
                      {isLive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRevokeTarget(token)}
                          aria-label={t('settings.apiTokens.revoke')}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onClose={closeCreate} title={t('settings.apiTokens.createTitle')}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="token-name">{t('settings.apiTokens.nameLabel')}</Label>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.apiTokens.namePlaceholder')}
              maxLength={120}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="token-expiry">{t('settings.apiTokens.expiryLabel')}</Label>
            <select
              id="token-expiry"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ExpiryPreset)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="30">{t('settings.apiTokens.expiry30')}</option>
              <option value="90">{t('settings.apiTokens.expiry90')}</option>
              <option value="365">{t('settings.apiTokens.expiry365')}</option>
              <option value="never">{t('settings.apiTokens.expiryNever')}</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('settings.apiTokens.scopeNote', { role: t(roleLabelKey) })}
          </p>
          {createErrorKey ? (
            <p className="text-sm text-destructive">{t(createErrorKey)}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeCreate}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('common.loading') : t('settings.apiTokens.createCta')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!pendingToken}
        onClose={() => {
          if (pendingToken) setPendingToken(null);
        }}
        title={t('settings.apiTokens.createdTitle')}
      >
        {pendingToken ? (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {t('settings.apiTokens.shownOnceWarning')}
            </div>
            <div className="space-y-1">
              <Label htmlFor="created-token">{t('settings.apiTokens.tokenValue')}</Label>
              <div className="flex gap-2">
                <Input
                  id="created-token"
                  value={pendingToken.token}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={copyToken}>
                  {copyConfirmed ? t('common.copied') : t('common.copy')}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.apiTokens.tokenUsageHint')}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setPendingToken(null)}>{t('common.done', 'Done')}</Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title={t('settings.apiTokens.revokeTitle')}
      >
        {revokeTarget ? (
          <div className="space-y-4">
            <p className="text-sm">
              {t('settings.apiTokens.revokeConfirm', { name: revokeTarget.name })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRevokeTarget(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRevoke}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? t('common.loading') : t('settings.apiTokens.revoke')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
