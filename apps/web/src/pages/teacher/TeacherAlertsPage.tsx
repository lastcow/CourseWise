import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, CircleCheck, Mail } from 'lucide-react';
import { MessageComposeDialog } from '@/components/messaging/MessageComposeDialog';
import {
  ALERT_TYPES,
  type AlertStatus,
  type AlertType,
  type AlertWithStudent,
} from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  useCourse,
  useCourseAlerts,
  useGenerateAlerts,
  useResolveAlert,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_TABS: AlertStatus[] = ['open', 'resolved', 'dismissed'];

// Color-coded outline badge per alert type so a teacher can scan the
// filter chip row and tell at a glance what kind of risk each chip is.
// Tones are the same across the chip and the per-row "type" badge.
const TYPE_TONE: Record<AlertType, string> = {
  attendance_low: 'border-amber-500/60 text-amber-700 dark:text-amber-300',
  consecutive_absences: 'border-red-500/60 text-red-700 dark:text-red-300',
  late_submissions: 'border-orange-500/60 text-orange-700 dark:text-orange-300',
  quiz_average_low:
    'border-yellow-500/60 text-yellow-700 dark:text-yellow-300',
  inactivity: 'border-sky-500/60 text-sky-700 dark:text-sky-300',
  manual: 'border-muted-foreground/40 text-muted-foreground',
};

const TYPE_ACTIVE: Record<AlertType, string> = {
  attendance_low: 'bg-amber-500/10',
  consecutive_absences: 'bg-red-500/10',
  late_submissions: 'bg-orange-500/10',
  quiz_average_low: 'bg-yellow-500/10',
  inactivity: 'bg-sky-500/10',
  manual: 'bg-muted',
};

function severityVariant(severity: string) {
  if (severity === 'critical') return 'destructive' as const;
  if (severity === 'warning') return 'secondary' as const;
  return 'outline' as const;
}

export function TeacherAlertsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const [status, setStatus] = useState<AlertStatus>('open');
  const [typeFilter, setTypeFilter] = useState<Set<AlertType>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const course = useCourse(cid || '');
  const alerts = useCourseAlerts(cid || null, status);
  const generate = useGenerateAlerts(cid);
  const resolve = useResolveAlert();
  const toast = useToast();

  const [resolving, setResolving] = useState<AlertWithStudent | null>(null);
  const [note, setNote] = useState('');
  const [messageTarget, setMessageTarget] = useState<{
    id: string;
    name: string;
    subject: string;
    context: string;
  } | null>(null);

  async function onGenerate() {
    try {
      const res = await generate.mutateAsync();
      toast.push({
        title: t('alerts.generated', { count: res.generated }),
        tone: 'success',
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onResolve(action: 'resolved' | 'dismissed') {
    if (!resolving) return;
    try {
      await resolve.mutateAsync({
        id: resolving.id,
        input: { status: action, resolutionNote: note.trim() || null },
      });
      setResolving(null);
      setNote('');
      toast.push({
        title: action === 'resolved' ? t('alerts.resolved') : t('alerts.dismissed'),
        tone: 'success',
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  function toggleType(tp: AlertType): void {
    setTypeFilter((current) => {
      const next = new Set(current);
      if (next.has(tp)) next.delete(tp);
      else next.add(tp);
      return next;
    });
  }

  function toggleExpanded(id: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Per-type counts off the loaded set so the chip can surface "(N)" at
  // a glance even before the teacher applies a filter.
  const typeCounts = useMemo(() => {
    const counts: Record<AlertType, number> = {
      attendance_low: 0,
      consecutive_absences: 0,
      late_submissions: 0,
      quiz_average_low: 0,
      inactivity: 0,
      manual: 0,
    };
    for (const a of alerts.data ?? []) {
      counts[a.type] = (counts[a.type] ?? 0) + 1;
    }
    return counts;
  }, [alerts.data]);

  const filtered = useMemo(() => {
    if (!alerts.data) return [];
    if (typeFilter.size === 0) return alerts.data;
    return alerts.data.filter((a) => typeFilter.has(a.type));
  }, [alerts.data, typeFilter]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{t('alerts.title')}</CardTitle>
          {course.data ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('alerts.scopedToCourse', {
                code: course.data.code,
                title: course.data.title,
              })}
            </p>
          ) : null}
        </div>
        <Button onClick={onGenerate} disabled={generate.isPending}>
          {t('alerts.runRules')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status tabs — Open / Resolved / Dismissed */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'rounded-md border px-3 py-1 text-sm transition-colors',
                status === s
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent',
              )}
            >
              {t(`alerts.status.${s}`)}
            </button>
          ))}
        </div>

        {/* Type filter chips. Multi-select: click to toggle each type
            in/out of the filter; with none active, all types show. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t('alerts.typeFilterLabel')}
          </span>
          {ALERT_TYPES.map((tp) => {
            const active = typeFilter.has(tp);
            return (
              <button
                key={tp}
                type="button"
                onClick={() => toggleType(tp)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  TYPE_TONE[tp],
                  active && TYPE_ACTIVE[tp],
                  active && 'ring-1 ring-current/40',
                )}
              >
                <span>{t(`alerts.type.${tp}`)}</span>
                <span className="tabular-nums opacity-70">
                  {typeCounts[tp]}
                </span>
              </button>
            );
          })}
          {typeFilter.size > 0 ? (
            <button
              type="button"
              onClick={() => setTypeFilter(new Set())}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
            >
              {t('alerts.clearTypeFilter')}
            </button>
          ) : null}
        </div>

        {alerts.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={t('alerts.emptyTitle')}
            description={t('alerts.emptyDescription')}
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((a) => {
              const open = expanded.has(a.id);
              return (
                <li
                  key={a.id}
                  data-state={open ? 'open' : 'closed'}
                  className={cn(
                    'overflow-hidden rounded-md border bg-card transition-colors',
                    open && 'border-primary/50',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(a.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                        open && 'rotate-90',
                      )}
                      aria-hidden
                    />
                    <Badge
                      variant={severityVariant(a.severity)}
                      className="shrink-0"
                    >
                      {t(`alerts.severity.${a.severity}`)}
                    </Badge>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium',
                        TYPE_TONE[a.type],
                      )}
                    >
                      {t(`alerts.type.${a.type}`)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {a.title}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {a.student?.name ?? '—'} ·{' '}
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t px-3 py-3 text-sm">
                      <div className="text-xs text-muted-foreground">
                        {a.student?.name ?? '—'} ·{' '}
                        {new Date(a.createdAt).toLocaleString()}
                      </div>
                      {a.body ? (
                        <p className="mt-2 text-muted-foreground">{a.body}</p>
                      ) : null}
                      <div className="mt-3 flex justify-end gap-2">
                        {a.student?.id ? (
                          <ActionIconButton
                            size="sm"
                            icon={Mail}
                            label={t('messages.composeCta')}
                            color="sky"
                            onClick={() =>
                              setMessageTarget({
                                id: a.student!.id,
                                name: a.student!.name,
                                subject: t('messages.aboutAlert', {
                                  title: a.title,
                                }),
                                context: t('messages.contextAlert', {
                                  title: a.title,
                                }),
                              })
                            }
                          />
                        ) : null}
                        {a.status === 'open' ? (
                          <ActionIconButton
                            size="sm"
                            icon={CircleCheck}
                            label={t('alerts.resolveCta')}
                            color="emerald"
                            onClick={() => {
                              setResolving(a);
                              setNote('');
                            }}
                          />
                        ) : null}
                      </div>
                      {a.status !== 'open' && a.resolutionNote ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {a.resolutionNote}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <Dialog
        open={!!resolving}
        onClose={() => setResolving(null)}
        title={t('alerts.resolveTitle')}
      >
        {resolving ? (
          <div className="space-y-3">
            <p className="text-sm">{resolving.title}</p>
            <label className="block space-y-1 text-sm font-medium">
              <span>{t('alerts.resolveNote')}</span>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onResolve('dismissed')}>
                {t('alerts.dismissCta')}
              </Button>
              <Button onClick={() => onResolve('resolved')} disabled={resolve.isPending}>
                {t('alerts.resolveCta')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
      {messageTarget ? (
        <MessageComposeDialog
          open
          onClose={() => setMessageTarget(null)}
          courseId={cid}
          recipientId={messageTarget.id}
          recipientName={messageTarget.name}
          initialSubject={messageTarget.subject}
          contextLine={messageTarget.context}
        />
      ) : null}
    </Card>
  );
}
