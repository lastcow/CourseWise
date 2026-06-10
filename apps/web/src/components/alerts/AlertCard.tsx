import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Info,
  Percent,
  Repeat,
  TriangleAlert,
  UserRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AlertSeverity, AlertWithContext } from '@coursewise/shared';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useResolveAlert } from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';
import { cn } from '@/lib/utils';

import { TYPE_TONE } from './alertTones';

const SEVERITY_META: Record<
  AlertSeverity,
  { icon: LucideIcon; iconColor: string; rail: string; badge: 'destructive' | 'warning' | 'info' }
> = {
  critical: {
    icon: CircleAlert,
    iconColor: 'text-destructive',
    rail: 'border-l-destructive',
    badge: 'destructive',
  },
  warning: {
    icon: TriangleAlert,
    iconColor: 'text-amber-600',
    rail: 'border-l-amber-500',
    badge: 'warning',
  },
  info: { icon: Info, iconColor: 'text-sky-600', rail: 'border-l-sky-500', badge: 'info' },
};

// Compact date + h:mm, e.g. "Jun 6, 9:35 AM".
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Pull the rule-specific numbers out of `alert.metadata` as terse fact chips. */
function metadataFacts(
  alert: AlertWithContext,
  t: (k: string, o?: Record<string, unknown>) => string,
): Array<{ icon: LucideIcon; text: string }> {
  const m = alert.metadata;
  if (!m) return [];
  const facts: Array<{ icon: LucideIcon; text: string }> = [];
  if (typeof m.rate === 'number') {
    facts.push({ icon: Percent, text: t('alerts.factAttendance', { pct: m.rate }) });
  }
  if (typeof m.present === 'number' && typeof m.sessions === 'number') {
    facts.push({
      icon: CalendarCheck,
      text: t('alerts.factPresent', { present: m.present, sessions: m.sessions }),
    });
  }
  if (typeof m.streak === 'number') {
    facts.push({ icon: Repeat, text: t('alerts.factStreak', { count: m.streak }) });
  }
  if (typeof m.count === 'number') {
    facts.push({ icon: Clock, text: t('alerts.factLate', { count: m.count }) });
  }
  if (typeof m.average === 'number') {
    facts.push({ icon: Percent, text: t('alerts.factQuizAvg', { pct: m.average }) });
  }
  if (typeof m.lastActivity === 'string') {
    facts.push({
      icon: Clock,
      text: t('alerts.factLastActivity', { date: formatDateTime(m.lastActivity) }),
    });
  }
  return facts;
}

/**
 * One alert, rich: severity rail + icon, title line with severity/type
 * badges and timestamp, context chips (student, course, metadata facts),
 * body, resolution footer, and a caller-provided actions slot.
 */
export function AlertCard({
  alert,
  showCourse = false,
  showStudent = true,
  actions,
}: {
  alert: AlertWithContext;
  showCourse?: boolean;
  showStudent?: boolean;
  actions?: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sev = SEVERITY_META[alert.severity] ?? SEVERITY_META.info;
  const SevIcon = sev.icon;
  const facts = metadataFacts(alert, t);

  return (
    <div className={cn('rounded-md border border-l-2 bg-card p-3', sev.rail)}>
      <div className="flex items-start gap-2.5">
        <SevIcon className={cn('mt-0.5 h-4 w-4 shrink-0', sev.iconColor)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 text-sm font-medium">{alert.title}</span>
            <Badge variant={sev.badge} className="shrink-0">
              {t(`alerts.severity.${alert.severity}`)}
            </Badge>
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium',
                TYPE_TONE[alert.type],
              )}
            >
              {t(`alerts.type.${alert.type}`)}
            </span>
            <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {formatDateTime(alert.createdAt)}
            </span>
          </div>

          {(showStudent && alert.student) || (showCourse && alert.course !== undefined) || facts.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {showStudent && alert.student ? (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" aria-hidden />
                  <span className="font-medium text-foreground">{alert.student.name}</span>
                </span>
              ) : null}
              {showCourse ? (
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  {alert.course ? (
                    <>
                      <span className="font-medium text-foreground">{alert.course.code}</span>
                      <span className="hidden sm:inline">· {alert.course.title}</span>
                    </>
                  ) : (
                    <span className="font-medium text-foreground">{t('alerts.systemGroup')}</span>
                  )}
                </span>
              ) : null}
              {facts.map((f, i) => {
                const FactIcon = f.icon;
                return (
                  <span key={i} className="inline-flex items-center gap-1.5 tabular-nums">
                    <FactIcon className="h-3.5 w-3.5" aria-hidden />
                    {f.text}
                  </span>
                );
              })}
            </div>
          ) : null}

          {alert.body ? (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{alert.body}</p>
          ) : null}

          {alert.status !== 'open' ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
              {alert.status === 'resolved' ? (
                <CircleCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              ) : (
                <XCircle className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="font-medium">{t(`alerts.status.${alert.status}`)}</span>
              {alert.resolvedAt ? (
                <span className="tabular-nums">· {formatDateTime(alert.resolvedAt)}</span>
              ) : null}
              {alert.resolutionNote ? <span className="basis-full">{alert.resolutionNote}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {alert.linkUrl ? (
            <ActionIconButton
              size="sm"
              icon={ArrowUpRight}
              label={t('alerts.openLink')}
              color="sky"
              onClick={() => navigate(alert.linkUrl!)}
            />
          ) : null}
          {actions}
        </div>
      </div>
    </div>
  );
}

/**
 * Collapsible group shell (per student / per course): chevron header with
 * count + severity badges, alert cards inside on a muted band.
 */
export function AlertGroup({
  title,
  icon: Icon,
  open,
  onToggle,
  count,
  critical,
  warning,
  children,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  open: boolean;
  onToggle: () => void;
  count: number;
  critical: number;
  warning: number;
  children: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <li
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'list-none overflow-hidden rounded-md border bg-card transition-colors',
        open && 'border-l-4 border-l-primary',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
          aria-hidden
        />
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <Badge variant="outline" className="shrink-0 tabular-nums">
          {t('alerts.alertCount', { count })}
        </Badge>
        {critical > 0 ? (
          <Badge variant="destructive" className="shrink-0 tabular-nums">
            {critical}
          </Badge>
        ) : null}
        {warning > 0 ? (
          <Badge variant="warning" className="shrink-0 tabular-nums">
            {warning}
          </Badge>
        ) : null}
      </button>
      {open ? <div className="space-y-2 border-t bg-muted/20 p-3">{children}</div> : null}
    </li>
  );
}

/**
 * Resolve / dismiss dialog with an optional note. Owns the mutation and
 * toasts; pages just hold the `alert | null` state.
 */
export function ResolveAlertDialog({
  alert,
  onClose,
}: {
  alert: AlertWithContext | null;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const resolve = useResolveAlert();
  const toast = useToast();
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote('');
  }, [alert?.id]);

  async function submit(action: 'resolved' | 'dismissed'): Promise<void> {
    if (!alert) return;
    try {
      await resolve.mutateAsync({
        id: alert.id,
        input: { status: action, resolutionNote: note.trim() || null },
      });
      onClose();
      toast.push({
        title: action === 'resolved' ? t('alerts.resolved') : t('alerts.dismissed'),
        tone: 'success',
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <Dialog open={!!alert} onClose={onClose} title={t('alerts.resolveTitle')}>
      {alert ? (
        <div className="space-y-3">
          <p className="text-sm">{alert.title}</p>
          <label className="block space-y-1 text-sm font-medium">
            <span>{t('alerts.resolveNote')}</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => void submit('dismissed')}
              disabled={resolve.isPending}
            >
              {t('alerts.dismissCta')}
            </Button>
            <Button onClick={() => void submit('resolved')} disabled={resolve.isPending}>
              {t('alerts.resolveCta')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
