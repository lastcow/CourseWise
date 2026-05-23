import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ban, Check, Copy, Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
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
import {
  useCourseInvitationCodes,
  useCreateCourseInvitationCode,
  useDeactivateInvitationCode,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import type { InvitationCodeSummary } from '@coursewise/shared';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function statusVariant(
  s: InvitationCodeSummary['status'],
): 'success' | 'secondary' | 'destructive' {
  if (s === 'active') return 'success';
  if (s === 'revoked') return 'destructive';
  return 'secondary';
}

/**
 * Build the shareable invite URL. We point at `/invite/:code` rather than
 * `/register?invitationCode=…` so a recipient who already has an account
 * lands on a "Join course" confirmation card instead of an empty
 * registration form. The `/invite/:code` page redirects logged-out users
 * to /register?invitationCode=… so the registration form auto-fills.
 */
function inviteUrl(code: string): string {
  const origin =
    typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${origin}/invite/${encodeURIComponent(code)}`;
}

export function TeacherInvitationsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useCourseInvitationCodes(id || null);
  const create = useCreateCourseInvitationCode(id);
  const deactivate = useDeactivateInvitationCode();
  const toast = useToast();

  const [openCreate, setOpenCreate] = useState(false);
  const [maxUses, setMaxUses] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [deactivateTarget, setDeactivateTarget] = useState<InvitationCodeSummary | null>(null);

  const onCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.push({ title: t('common.copied'), tone: 'success' });
    } catch {
      toast.push({ title: t('common.error'), tone: 'error' });
    }
  };

  const onCopyLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      toast.push({ title: t('invitations.linkCopied'), tone: 'success' });
    } catch {
      toast.push({ title: t('common.error'), tone: 'error' });
    }
  };

  const onCreate = async () => {
    const parsedMax = maxUses.trim() ? Number.parseInt(maxUses, 10) : null;
    if (parsedMax !== null && (!Number.isFinite(parsedMax) || parsedMax <= 0)) {
      toast.push({ title: t('invitations.maxUsesInvalid'), tone: 'error' });
      return;
    }
    const isoExpiry = expiresAt.trim() ? new Date(expiresAt).toISOString() : null;
    try {
      const created = await create.mutateAsync({
        maxUses: parsedMax,
        expiresAt: isoExpiry,
      });
      toast.push({ title: t('invitations.created'), tone: 'success' });
      setOpenCreate(false);
      setMaxUses('');
      setExpiresAt('');
      // Auto-copy the full invite link (not just the code) so the teacher can
      // paste it straight into a chat/email — students who click it land on
      // /register with the code pre-filled, or on a "Join course" card if
      // they already have an account.
      void onCopyLink(created.code);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await deactivate.mutateAsync(deactivateTarget.id);
      toast.push({ title: t('invitations.deactivated'), tone: 'success' });
      setDeactivateTarget(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('invitations.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('invitations.helpText')}</p>
      </header>

      <div className="overflow-hidden rounded-md border">
        <div className="flex items-center justify-end gap-1.5 border-b bg-muted/30 px-3 py-2">
          <Button variant="outline" size="sm" onClick={() => setOpenCreate(true)}>
            {t('invitations.generateCta')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
          >
            <RefreshCw
              className={list.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
              aria-hidden
            />
          </Button>
        </div>
        {list.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('invitations.empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('invitations.code')}</TableHead>
                <TableHead>{t('invitations.status')}</TableHead>
                <TableHead className="text-right">{t('invitations.usedCount')}</TableHead>
                <TableHead>{t('invitations.expiresAt')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">
                    <div className="space-y-0.5">
                      <div>{row.code}</div>
                      <a
                        href={inviteUrl(row.code)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-xs font-normal text-muted-foreground underline-offset-2 hover:underline"
                        title={inviteUrl(row.code)}
                      >
                        {inviteUrl(row.code)}
                      </a>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>
                      {t(`invitations.status${row.status[0]!.toUpperCase()}${row.status.slice(1)}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.usedCount}
                    {row.maxUses != null ? ` / ${row.maxUses}` : ''}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.expiresAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <ActionIconButton
                        icon={Copy}
                        label={t('invitations.copyCode')}
                        color="sky"
                        size="sm"
                        onClick={() => void onCopy(row.code)}
                      />
                      <ActionIconButton
                        icon={Link2}
                        label={t('invitations.copyLink')}
                        color="teal"
                        size="sm"
                        onClick={() => void onCopyLink(row.code)}
                      />
                      {row.status === 'active' ? (
                        <ActionIconButton
                          icon={Ban}
                          label={t('invitations.deactivate')}
                          color="red"
                          size="sm"
                          onClick={() => setDeactivateTarget(row)}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title={t('invitations.generateTitle')}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('invitations.generateHint')}</p>
          <div>
            <Label htmlFor="inv-max">{t('invitations.maxUsesLabel')}</Label>
            <Input
              id="inv-max"
              type="number"
              min={1}
              max={10000}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder={t('invitations.maxUsesPlaceholder')}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('invitations.maxUsesHint')}</p>
          </div>
          <div>
            <Label htmlFor="inv-exp">{t('invitations.expiresAtLabel')}</Label>
            <Input
              id="inv-exp"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('invitations.expiresAtHint')}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenCreate(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onCreate} disabled={create.isPending}>
              <Check className="h-4 w-4" />
              {t('invitations.generateCta')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        title={t('invitations.deactivateTitle')}
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">{t('invitations.deactivateConfirm')}</p>
        {deactivateTarget ? (
          <p className="mt-2 font-mono text-sm">{deactivateTarget.code}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" disabled={deactivate.isPending} onClick={onDeactivate}>
            {t('invitations.deactivate')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
