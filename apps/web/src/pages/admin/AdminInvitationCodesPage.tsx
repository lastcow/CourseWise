import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCoursesList,
  useCreateInvitationCode,
  useDeactivateInvitationCode,
  useInvitationCodesList,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';

export function AdminInvitationCodesPage(): JSX.Element {
  const { t } = useTranslation();
  const list = useInvitationCodesList();
  const deactivate = useDeactivateInvitationCode();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('invitations.title')}</h1>
        <Button onClick={() => setOpen(true)}>{t('invitations.newCta')}</Button>
      </header>
      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState
          title={t('invitations.empty')}
          action={<Button onClick={() => setOpen(true)}>{t('invitations.newCta')}</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invitations.code')}</TableHead>
                  <TableHead>{t('invitations.course')}</TableHead>
                  <TableHead>{t('invitations.usedCount')}</TableHead>
                  <TableHead>{t('invitations.expiresAt')}</TableHead>
                  <TableHead>{t('invitations.status')}</TableHead>
                  <TableHead className="text-right">{t('common.copy')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono">{row.code}</TableCell>
                    <TableCell>{row.courseTitle ?? t('common.none')}</TableCell>
                    <TableCell>
                      {row.usedCount}
                      {row.maxUses ? ` / ${row.maxUses}` : ''}
                    </TableCell>
                    <TableCell>{row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === 'active' ? 'success' : row.status === 'revoked' ? 'secondary' : 'outline'
                        }
                      >
                        {t(`invitations.status${row.status[0]!.toUpperCase()}${row.status.slice(1)}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(row.code);
                            toast.push({ title: t('common.copied'), tone: 'success' });
                          } catch {
                            toast.push({ title: t('common.error'), tone: 'error' });
                          }
                        }}
                      >
                        {t('common.copy')}
                      </Button>
                      {row.status === 'active' ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            try {
                              await deactivate.mutateAsync(row.id);
                              toast.push({ title: t('invitations.deactivated'), tone: 'success' });
                            } catch (err) {
                              const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                              toast.push({ title: t(i18n), tone: 'error' });
                            }
                          }}
                        >
                          {t('invitations.deactivate')}
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
      <CreateInvitationDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function CreateInvitationDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const courses = useCoursesList();
  const create = useCreateInvitationCode();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [courseId, setCourseId] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await create.mutateAsync({
        code: code.trim() || undefined,
        courseId: courseId || null,
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      toast.push({ title: t('invitations.created'), description: result.code, tone: 'success' });
      onClose();
      setCode('');
      setCourseId('');
      setMaxUses('');
      setExpiresAt('');
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t('invitations.newCta')}>
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="space-y-1">
          <Label htmlFor="code">{t('invitations.code')}</Label>
          <Input id="code" placeholder="(auto)" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="courseId">{t('invitations.course')}</Label>
          <select
            id="courseId"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">{t('common.none')}</option>
            {courses.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="maxUses">{t('invitations.maxUses')}</Label>
            <Input id="maxUses" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expiresAt">{t('invitations.expiresAt')}</Label>
            <Input id="expiresAt" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t('common.loading') : t('common.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
