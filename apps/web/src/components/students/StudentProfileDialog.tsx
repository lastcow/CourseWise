import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  useDeleteStudentAccount,
  useStudentProfile,
  useUpdateStudentProfile,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The student row's user id. */
  userId: string;
  /** When true, the Danger Zone block is rendered. Authoritative gate is
   *  server-side; this prop only controls visibility. */
  canDelete?: boolean;
};

/**
 * Modify-student dialog used by teacher/admin (any row) and student (own
 * row only). Shows all basic info plus the student's enrollments
 * (read-only), and lets the caller edit two fields: name and student#.
 * Server-side permission and field allowlist are the authoritative gate;
 * this dialog only renders what the caller can see.
 */
export function StudentProfileDialog({ open, onClose, userId, canDelete = false }: Props): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const q = useStudentProfile(open ? userId : null);
  const update = useUpdateStudentProfile();
  const del = useDeleteStudentAccount();

  const [name, setName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [reason, setReason] = useState('');

  // Re-prime form when the dialog opens or the loaded record changes.
  useEffect(() => {
    if (open && q.data) {
      setName(q.data.name);
      setStudentNumber(q.data.studentNumber ?? '');
    }
  }, [open, q.data]);

  // Reset the confirm form whenever the confirm dialog closes.
  useEffect(() => {
    if (!confirmOpen) {
      setConfirmEmail('');
      setReason('');
    }
  }, [confirmOpen]);

  const data = q.data ?? null;
  const dirty =
    data !== null &&
    (name.trim() !== data.name || (studentNumber.trim() || null) !== (data.studentNumber ?? null));

  const onSave = async () => {
    if (!data || !dirty) return;
    const input: { name?: string; studentNumber?: string | null } = {};
    if (name.trim() !== data.name) input.name = name.trim();
    const nextNum = studentNumber.trim() === '' ? null : studentNumber.trim();
    if (nextNum !== (data.studentNumber ?? null)) input.studentNumber = nextNum;
    try {
      await update.mutateAsync({ userId, input });
      toast.push({ title: t('studentProfile.saved'), tone: 'success' });
      onClose();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const confirmReady =
    data !== null && confirmEmail.trim().toLowerCase() === data.email.toLowerCase();

  const onDelete = async () => {
    if (!data || !confirmReady) return;
    try {
      const res = await del.mutateAsync({ userId, reason: reason.trim() || null });
      toast.push({
        title:
          res.emailStatus === 'sent'
            ? t('studentProfile.deleteSuccess')
            : t('studentProfile.deleteEmailFailed'),
        tone: res.emailStatus === 'sent' ? 'success' : 'info',
      });
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={update.isPending ? () => undefined : onClose}
      title={t('studentProfile.title')}
      dismissOnBackdropClick={false}
    >
      {q.isLoading || !data ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="space-y-4">
          {/* Read-only basics */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            <dt className="text-muted-foreground">{t('studentProfile.emailLabel')}</dt>
            <dd className="text-foreground">{data.email}</dd>
            <dt className="text-muted-foreground">{t('studentProfile.roleLabel')}</dt>
            <dd>
              <Badge variant="secondary">{t(`roles.${data.role}`)}</Badge>
            </dd>
            <dt className="text-muted-foreground">{t('studentProfile.enrollmentYearLabel')}</dt>
            <dd className="text-foreground">{data.enrollmentYear ?? '—'}</dd>
            <dt className="text-muted-foreground">{t('studentProfile.languageLabel')}</dt>
            <dd className="text-foreground">{data.preferredLanguage}</dd>
          </dl>

          {/* Editable fields */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sp-name">{t('studentProfile.nameLabel')}</Label>
              <Input
                id="sp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                disabled={update.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-number">{t('studentProfile.studentNumberLabel')}</Label>
              <Input
                id="sp-number"
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                maxLength={60}
                placeholder={t('studentProfile.studentNumberPlaceholder')}
                disabled={update.isPending}
              />
            </div>
          </div>

          {/* Enrollments (read-only) */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              {t('studentProfile.enrollmentsHeading', { count: data.enrollments.length })}
            </div>
            {data.enrollments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('studentProfile.noEnrollments')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.enrollments.map((e) => (
                  <li
                    key={e.courseId}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {e.courseCode}
                        </span>
                        <span className="truncate">{e.courseTitle}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('studentProfile.enrolledAt', {
                          date: new Date(e.enrolledAt).toLocaleDateString(),
                        })}
                      </div>
                    </div>
                    <Badge variant={e.status === 'enrolled' ? 'success' : 'secondary'}>
                      {t(`students.status${e.status[0]!.toUpperCase()}${e.status.slice(1)}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={update.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void onSave()} disabled={update.isPending || !dirty}>
              {update.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>

          {canDelete && data.role === 'student' ? (
            <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="text-sm font-semibold text-destructive">
                {t('studentProfile.dangerZoneTitle')}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('studentProfile.dangerZoneBody')}
              </p>
              <div className="mt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => setConfirmOpen(true)}
                >
                  {t('studentProfile.deleteCta')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {data ? (
        <Dialog
          open={confirmOpen}
          onClose={del.isPending ? () => undefined : () => setConfirmOpen(false)}
          title={t('studentProfile.deleteConfirmTitle')}
          dismissOnBackdropClick={false}
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('studentProfile.deleteConfirmBody', { name: data.name, email: data.email })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('studentProfile.enrollmentsHeading', { count: data.enrollments.length })}
            </p>
            <div className="space-y-1">
              <Label htmlFor="sp-confirm-email">
                {t('studentProfile.deleteConfirmTypeLabel', { email: data.email })}
              </Label>
              <Input
                id="sp-confirm-email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={data.email}
                autoComplete="off"
                disabled={del.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp-reason">{t('studentProfile.reasonLabel')}</Label>
              <Textarea
                id="sp-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                disabled={del.isPending}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={del.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void onDelete()}
                disabled={!confirmReady || del.isPending}
              >
                {del.isPending
                  ? t('common.loading')
                  : t('studentProfile.deleteConfirmAction')}
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </Dialog>
  );
}
