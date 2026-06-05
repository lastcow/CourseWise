import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Hourglass, ShieldAlert, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useSignAttendance } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import {
  ATTENDANCE_SELF_SIGN_OPEN_BEFORE_MINUTES,
  type AttendanceSessionSummary,
  type AttendanceWindowState,
  type AttendanceStatus,
} from '@coursewise/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  courseId: string;
  session: AttendanceSessionSummary;
  alreadySigned: boolean;
  windowState: AttendanceWindowState;
  minutesSinceStart: number;
}

export function AttendanceSignInDialog({
  open,
  onClose,
  courseId,
  session,
  alreadySigned,
  windowState,
  minutesSinceStart,
}: Props): JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const sign = useSignAttendance(courseId);
  const [result, setResult] = useState<
    { ip: string | null; status: AttendanceStatus } | undefined
  >(undefined);
  const completed = alreadySigned || result !== undefined;
  const closed = windowState === 'closed';
  const early = windowState === 'early';
  const opensAt = new Date(
    new Date(session.sessionDate).getTime() - ATTENDANCE_SELF_SIGN_OPEN_BEFORE_MINUTES * 60_000,
  );

  const onSubmit = async (): Promise<void> => {
    try {
      const res = await sign.mutateAsync(session.id);
      setResult({ ip: res.ipAddress, status: res.status });
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
          {session.absentAfterMinutes != null || session.lateAfterMinutes != null ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {session.lateAfterMinutes != null
                ? t('attendance.signIn.lateThresholdLabel', {
                    minutes: session.lateAfterMinutes,
                  })
                : null}
              {session.lateAfterMinutes != null && session.absentAfterMinutes != null ? ' · ' : ''}
              {session.absentAfterMinutes != null
                ? t('attendance.signIn.absentThresholdLabel', {
                    minutes: session.absentAfterMinutes,
                  })
                : null}
            </p>
          ) : null}
        </section>

        {completed ? (
          <section className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">
                {result?.status === 'late'
                  ? t('attendance.signIn.successLate')
                  : t('attendance.signIn.success')}
              </div>
              <div className="text-xs">
                {alreadySigned
                  ? t('attendance.signIn.alreadySigned')
                  : result?.ip
                    ? t('attendance.signIn.successDetail', { ip: result.ip })
                    : t('attendance.signIn.successDetailNoIp')}
              </div>
            </div>
          </section>
        ) : closed ? (
          <section
            role="alert"
            className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100"
          >
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="space-y-1">
              <div className="text-sm font-semibold">
                {t('attendance.signIn.windowClosedHeading')}
              </div>
              <p className="text-xs leading-relaxed">
                {t('attendance.signIn.windowClosedBody', {
                  minutes: session.absentAfterMinutes ?? minutesSinceStart,
                })}
              </p>
            </div>
          </section>
        ) : early ? (
          <section
            role="status"
            className="flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100"
          >
            <Hourglass className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="space-y-1">
              <div className="text-sm font-semibold">
                {t('attendance.signIn.notOpenHeading')}
              </div>
              <p className="text-xs leading-relaxed">
                {t('attendance.signIn.notOpenBody', {
                  minutes: ATTENDANCE_SELF_SIGN_OPEN_BEFORE_MINUTES,
                  time: opensAt.toLocaleTimeString(i18n.language, {
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
                })}
              </p>
            </div>
          </section>
        ) : (
          <>
            {windowState === 'late' ? (
              <section
                role="status"
                className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold">
                    {t('attendance.signIn.willBeLateHeading')}
                  </div>
                  <p className="text-xs leading-relaxed">
                    {t('attendance.signIn.willBeLateBody', {
                      minutes: minutesSinceStart,
                    })}
                  </p>
                </div>
              </section>
            ) : null}
            <section className="flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <div className="space-y-1">
                <div className="text-sm font-semibold">
                  {t('attendance.signIn.ipNoticeHeading')}
                </div>
                <p className="text-xs leading-relaxed">{t('attendance.signIn.ipNoticeBody')}</p>
              </div>
            </section>
          </>
        )}

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('attendance.signIn.closeCta')}
          </Button>
          {completed || closed || early ? null : (
            <Button type="button" onClick={onSubmit} disabled={sign.isPending}>
              {sign.isPending
                ? t('attendance.signIn.submitting')
                : windowState === 'late'
                  ? t('attendance.signIn.submitLateCta')
                  : t('attendance.signIn.submitCta')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
