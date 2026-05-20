import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeacherInvitationStatus } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { ApiClientError } from '@/lib/api';
import { pickI18nKey } from '@/lib/api';
import {
  useCreateTeacherInvitation,
  useResendTeacherInvitation,
  useRevokeTeacherInvitation,
  useTeacherInvitationsList,
  useTeachersList,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';

const STATUS_TABS: TeacherInvitationStatus[] = ['pending', 'accepted', 'revoked', 'expired'];

export function AdminTeachersPage(): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TeacherInvitationStatus>('pending');
  const teachers = useTeachersList();
  const invitations = useTeacherInvitationsList(tab);
  const revoke = useRevokeTeacherInvitation();
  const resend = useResendTeacherInvitation();
  const toast = useToast();
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.push({ title: t('common.copied'), tone: 'success' });
    } catch {
      toast.push({ title: t('common.error'), tone: 'error' });
    }
  }

  async function onRevoke(id: string) {
    if (!window.confirm(t('teachers.confirmRevoke'))) return;
    try {
      await revoke.mutateAsync(id);
      toast.push({ title: t('teachers.invitationRevoked'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onResend(id: string) {
    try {
      const created = await resend.mutateAsync(id);
      setLastInviteUrl(created.inviteUrl);
      toast.push({
        title: created.emailSent
          ? t('teachers.invitationEmailed', { email: created.email })
          : t('teachers.invitationResent'),
        tone: 'success',
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('teachers.title')}</h1>
        <Button onClick={() => setOpen(true)}>{t('teachers.inviteCta')}</Button>
      </header>

      {lastInviteUrl ? (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium">{t('teachers.inviteLinkReady')}</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={lastInviteUrl} className="font-mono text-xs" />
              <Button variant="outline" onClick={() => copy(lastInviteUrl)}>
                {t('common.copy')}
              </Button>
              <Button variant="ghost" onClick={() => setLastInviteUrl(null)}>
                {t('common.dismiss')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('teachers.inviteLinkHint')}</p>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('teachers.existingTitle')}</h2>
        {teachers.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : !teachers.data || teachers.data.length === 0 ? (
          <EmptyState title={t('teachers.empty')} />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('teachers.name')}</TableHead>
                    <TableHead>{t('teachers.email')}</TableHead>
                    <TableHead>{t('teachers.courseCount')}</TableHead>
                    <TableHead>{t('teachers.createdAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachers.data.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-medium">{teacher.name}</TableCell>
                      <TableCell className="font-mono text-xs">{teacher.email}</TableCell>
                      <TableCell>{teacher.courseCount}</TableCell>
                      <TableCell>{new Date(teacher.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('teachers.invitationsTitle')}</h2>
        <div className="flex gap-2">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={`rounded-md border px-3 py-1 text-sm ${
                tab === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground'
              }`}
            >
              {t(`teachers.statusTab.${s}`)}
            </button>
          ))}
        </div>
        {invitations.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : !invitations.data || invitations.data.items.length === 0 ? (
          <EmptyState title={t('teachers.invitationsEmpty')} />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('teachers.email')}</TableHead>
                    <TableHead>{t('teachers.invitedBy')}</TableHead>
                    <TableHead>{t('teachers.invitedAt')}</TableHead>
                    <TableHead>{t('teachers.expiresAt')}</TableHead>
                    <TableHead>{t('teachers.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.data.items.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.email}</TableCell>
                      <TableCell>{inv.inviterName}</TableCell>
                      <TableCell>{new Date(inv.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{new Date(inv.expiresAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            inv.status === 'pending'
                              ? 'success'
                              : inv.status === 'accepted'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {t(`teachers.statusTab.${inv.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        {inv.status === 'pending' || inv.status === 'expired' ? (
                          <Button size="sm" variant="outline" onClick={() => onResend(inv.id)}>
                            {t('teachers.resend')}
                          </Button>
                        ) : null}
                        {inv.status === 'pending' ? (
                          <Button size="sm" variant="destructive" onClick={() => onRevoke(inv.id)}>
                            {t('teachers.revoke')}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      <InviteTeacherDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(url) => setLastInviteUrl(url)}
      />
    </div>
  );
}

interface InviteTeacherDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (inviteUrl: string) => void;
}

function InviteTeacherDialog({ open, onClose, onCreated }: InviteTeacherDialogProps): JSX.Element {
  const { t } = useTranslation();
  const create = useCreateTeacherInvitation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail('');
    setName('');
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await create.mutateAsync({
        email: email.trim(),
        name: name.trim() ? name.trim() : undefined,
      });
      toast.push({
        title: created.emailSent
          ? t('teachers.invitationEmailed', { email: created.email })
          : t('teachers.invitationSent'),
        tone: 'success',
      });
      onCreated(created.inviteUrl);
      reset();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(t(err.error.i18nKey));
      } else {
        setError(t('errors.internal'));
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('teachers.inviteDialogTitle')}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1">
          <Label htmlFor="teacher-invite-email">{t('teachers.email')}</Label>
          <Input
            id="teacher-invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teacher@example.com"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="teacher-invite-name">{t('teachers.nameOptional')}</Label>
          <Input
            id="teacher-invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('teachers.namePlaceholder')}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t('common.loading') : t('teachers.sendInvite')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
