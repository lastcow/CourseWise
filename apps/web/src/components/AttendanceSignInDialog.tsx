import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useSignAttendance } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import type { AttendanceSessionSummary } from '@coursewise/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  courseId: string;
  session: AttendanceSessionSummary;
  alreadySigned: boolean;
}

export function AttendanceSignInDialog({
  open,
  onClose,
  courseId,
  session,
  alreadySigned,
}: Props): JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const sign = useSignAttendance(courseId);
  const [resultIp, setResultIp] = useState<string | null | undefined>(undefined);
  const completed = alreadySigned || resultIp !== undefined;

  const onSubmit = async (): Promise<void> => {
    try {
      const res = await sign.mutateAsync(session.id);
      setResultIp(res.ipAddress);
      toast.push({ title: t('attendance.signIn.success'), tone: 'success' });
    } catch (err) {
      const i18nKey = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18nKey), tone: 'error' });
    }
  };

  const formattedDate = new Date(session.sessionDate).toLocaleString(i18n.language, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissOnBackdropClick={false}
      title={t('attendance.signIn.dialogTitle')}
      className="max-w-md"
    >
      <div className="space-y-5">
        <section className="space-y-1">
          <div className="text-lg font-medium leading-tight">{session.title}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('attendance.signIn.scheduledFor')}
          </div>
          <div className="text-sm text-foreground">{formattedDate}</div>
          {session.description ? (
            <p className="pt-1 text-sm text-muted-foreground">{session.description}</p>
          ) : null}
        </section>

        {completed ? (
          <section className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">{t('attendance.signIn.success')}</div>
              <div className="text-xs">
                {alreadySigned
                  ? t('attendance.signIn.alreadySigned')
                  : resultIp
                    ? t('attendance.signIn.successDetail', { ip: resultIp })
                    : t('attendance.signIn.successDetailNoIp')}
              </div>
            </div>
          </section>
        ) : (
          <section className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="space-y-1">
              <div className="text-sm font-semibold">
                {t('attendance.signIn.ipNoticeHeading')}
              </div>
              <p className="text-xs leading-relaxed">{t('attendance.signIn.ipNoticeBody')}</p>
            </div>
          </section>
        )}

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('attendance.signIn.closeCta')}
          </Button>
          {completed ? null : (
            <Button type="button" onClick={onSubmit} disabled={sign.isPending}>
              {sign.isPending ? t('attendance.signIn.submitting') : t('attendance.signIn.submitCta')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
