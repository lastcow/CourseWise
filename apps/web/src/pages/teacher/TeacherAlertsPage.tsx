import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CircleAlert, CircleCheck, Mail, TriangleAlert, UserRound } from 'lucide-react';
import { MessageComposeDialog } from '@/components/messaging/MessageComposeDialog';
import {
  ALERT_TYPES,
  type AlertStatus,
  type AlertType,
  type AlertWithStudent,
} from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { StatCard, StatGrid } from '@/components/dashboard/DashboardKit';
import { AlertCard, AlertGroup, ResolveAlertDialog } from '@/components/alerts/AlertCard';
import { TYPE_ACTIVE, TYPE_TONE } from '@/components/alerts/alertTones';
import { useToast } from '@/components/ui/toast';
import { useCourse, useCourseAlerts, useGenerateAlerts } from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_TABS: AlertStatus[] = ['open', 'resolved', 'dismissed'];

export function TeacherAlertsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const [status, setStatus] = useState<AlertStatus>('open');
  const [typeFilter, setTypeFilter] = useState<Set<AlertType>>(new Set());
  // Per-group open state, keyed by student id (or '__unassigned__').
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const course = useCourse(cid || '');
  const alerts = useCourseAlerts(cid || null, status);
  // Stat tiles always describe the open queue, whichever tab is shown.
  const openAlerts = useCourseAlerts(cid || null, 'open');
  const generate = useGenerateAlerts(cid);
  const toast = useToast();

  const [resolving, setResolving] = useState<AlertWithStudent | null>(null);
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

  function toggleType(tp: AlertType): void {
    setTypeFilter((current) => {
      const next = new Set(current);
      if (next.has(tp)) next.delete(tp);
      else next.add(tp);
      return next;
    });
  }

  function toggleGroup(key: string): void {
    setClosedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const stats = useMemo(() => {
    const list = openAlerts.data ?? [];
    return {
      open: list.length,
      critical: list.filter((a) => a.severity === 'critical').length,
      warning: list.filter((a) => a.severity === 'warning').length,
      students: new Set(list.filter((a) => a.student?.id).map((a) => a.student!.id)).size,
    };
  }, [openAlerts.data]);

  // Per-type counts off the loaded set so the chip can surface "(N)" at
  // a glance even before the teacher applies a filter.
  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(ALERT_TYPES.map((tp) => [tp, 0])) as Record<
      AlertType,
      number
    >;
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

  // Group by student so the page reads as "what's going on with each
  // person" instead of a flat list. Manual alerts without a student
  // fall into an Unassigned bucket pinned at the bottom.
  const grouped = useMemo(() => {
    const byStudent = new Map<
      string,
      { id: string | null; name: string; alerts: AlertWithStudent[] }
    >();
    for (const a of filtered) {
      const key = a.student?.id ?? '__unassigned__';
      const entry =
        byStudent.get(key) ??
        {
          id: a.student?.id ?? null,
          name: a.student?.name ?? '',
          alerts: [] as AlertWithStudent[],
        };
      entry.alerts.push(a);
      byStudent.set(key, entry);
    }
    const named = [...byStudent.values()]
      .filter((g) => g.id !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    const unassigned = byStudent.get('__unassigned__');
    return unassigned ? [...named, unassigned] : named;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <CourseSectionHeader
        title={t('alerts.title')}
        description={
          course.data
            ? t('alerts.scopedToCourse', { code: course.data.code, title: course.data.title })
            : undefined
        }
        actions={
          <Button size="sm" onClick={onGenerate} disabled={generate.isPending}>
            {t('alerts.runRules')}
          </Button>
        }
      />

      <StatGrid className="lg:grid-cols-4">
        <StatCard icon={Bell} label={t('alerts.status.open')} value={stats.open} />
        <StatCard
          icon={CircleAlert}
          tone="danger"
          label={t('alerts.severity.critical')}
          value={stats.critical}
        />
        <StatCard
          icon={TriangleAlert}
          tone="alert"
          label={t('alerts.severity.warning')}
          value={stats.warning}
        />
        <StatCard icon={UserRound} label={t('alerts.statStudents')} value={stats.students} />
      </StatGrid>

      <div className="space-y-3">
        {/* Status segmented control + type filter chips */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
            {STATUS_TABS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  status === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {t(`alerts.status.${s}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t('alerts.typeFilterLabel')}</span>
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
                  <span className="tabular-nums opacity-70">{typeCounts[tp]}</span>
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
        </div>

        {alerts.isLoading ? (
          <ListSkeleton rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title={t('alerts.emptyTitle')}
            description={t('alerts.emptyDescription')}
          />
        ) : (
          <ul className="space-y-2">
            {grouped.map((g) => {
              const key = g.id ?? '__unassigned__';
              // Default open for "open" status (actionable view);
              // default closed for resolved/dismissed (historical view).
              const defaultOpen = status === 'open';
              const isToggled = closedGroups.has(key);
              const isOpen = defaultOpen ? !isToggled : isToggled;
              const critical = g.alerts.filter((a) => a.severity === 'critical').length;
              const warning = g.alerts.filter((a) => a.severity === 'warning').length;
              return (
                <AlertGroup
                  key={key}
                  icon={UserRound}
                  title={g.id ? g.name : t('alerts.unassignedGroup')}
                  open={isOpen}
                  onToggle={() => toggleGroup(key)}
                  count={g.alerts.length}
                  critical={critical}
                  warning={warning}
                >
                  {g.alerts.map((a) => (
                    <AlertCard
                      key={a.id}
                      alert={a}
                      showStudent={false}
                      actions={
                        <>
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
                                  subject: t('messages.aboutAlert', { title: a.title }),
                                  context: t('messages.contextAlert', { title: a.title }),
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
                              onClick={() => setResolving(a)}
                            />
                          ) : null}
                        </>
                      }
                    />
                  ))}
                </AlertGroup>
              );
            })}
          </ul>
        )}
      </div>

      <ResolveAlertDialog alert={resolving} onClose={() => setResolving(null)} />
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
    </div>
  );
}
