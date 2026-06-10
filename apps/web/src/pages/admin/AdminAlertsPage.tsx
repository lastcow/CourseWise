import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ALERT_SEVERITIES,
  ALERT_TYPES,
  type AlertSeverity,
  type AlertStatus,
  type AlertType,
  type AlertWithContext,
} from '@coursewise/shared';
import {
  Bell,
  BookOpen,
  CircleAlert,
  CircleCheck,
  Info,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { EmptyState } from '@/components/ui/empty';
import { ListSkeleton } from '@/components/course/CourseSectionHeader';
import { DashboardHeader, StatCard, StatGrid } from '@/components/dashboard/DashboardKit';
import { AlertCard, AlertGroup, ResolveAlertDialog } from '@/components/alerts/AlertCard';
import { TYPE_ACTIVE, TYPE_TONE } from '@/components/alerts/alertTones';
import { useAdminAlerts } from '@/lib/queries';
import { cn } from '@/lib/utils';

const STATUS_TABS: AlertStatus[] = ['open', 'resolved', 'dismissed'];

const SEVERITY_TONE: Record<AlertSeverity, { chip: string; active: string }> = {
  critical: { chip: 'border-red-500/60 text-red-700 dark:text-red-300', active: 'bg-red-500/10' },
  warning: {
    chip: 'border-amber-500/60 text-amber-700 dark:text-amber-300',
    active: 'bg-amber-500/10',
  },
  info: { chip: 'border-sky-500/60 text-sky-700 dark:text-sky-300', active: 'bg-sky-500/10' },
};

export function AdminAlertsPage(): JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AlertStatus>('open');
  const [severityFilter, setSeverityFilter] = useState<Set<AlertSeverity>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<AlertType>>(new Set());
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<AlertWithContext | null>(null);

  const current = useAdminAlerts(status);
  // Stat tiles always describe the open queue, whichever tab is shown.
  const open = useAdminAlerts('open');

  const stats = useMemo(() => {
    const list = open.data ?? [];
    return {
      open: list.length,
      critical: list.filter((a) => a.severity === 'critical').length,
      warning: list.filter((a) => a.severity === 'warning').length,
      info: list.filter((a) => a.severity === 'info').length,
      courses: new Set(list.filter((a) => a.courseId).map((a) => a.courseId)).size,
    };
  }, [open.data]);

  const counts = useMemo(() => {
    const bySeverity: Record<AlertSeverity, number> = { critical: 0, warning: 0, info: 0 };
    const byType = Object.fromEntries(ALERT_TYPES.map((tp) => [tp, 0])) as Record<
      AlertType,
      number
    >;
    for (const a of current.data ?? []) {
      bySeverity[a.severity] += 1;
      byType[a.type] += 1;
    }
    return { bySeverity, byType };
  }, [current.data]);

  const filtered = useMemo(() => {
    let list = current.data ?? [];
    if (severityFilter.size > 0) list = list.filter((a) => severityFilter.has(a.severity));
    if (typeFilter.size > 0) list = list.filter((a) => typeFilter.has(a.type));
    return list;
  }, [current.data, severityFilter, typeFilter]);

  // Group by course; system alerts (no course) pinned last.
  const grouped = useMemo(() => {
    const byCourse = new Map<
      string,
      { course: AlertWithContext['course']; alerts: AlertWithContext[] }
    >();
    for (const a of filtered) {
      const key = a.course?.id ?? '__system__';
      const entry = byCourse.get(key) ?? { course: a.course ?? null, alerts: [] };
      entry.alerts.push(a);
      byCourse.set(key, entry);
    }
    const named = [...byCourse.entries()]
      .filter(([key]) => key !== '__system__')
      .sort((a, b) => (a[1].course?.code ?? '').localeCompare(b[1].course?.code ?? ''));
    const system = byCourse.get('__system__');
    return system ? [...named, ['__system__', system] as const] : named;
  }, [filtered]);

  const toggle = <T,>(set: (fn: (s: Set<T>) => Set<T>) => void, v: T): void =>
    set((cur) => {
      const next = new Set(cur);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  return (
    <div className="space-y-4">
      <DashboardHeader
        title={t('alerts.adminCenterTitle')}
        subtitle={t('alerts.centerSubtitle')}
      />

      <StatGrid className="lg:grid-cols-5">
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
        <StatCard icon={Info} label={t('alerts.severity.info')} value={stats.info} />
        <StatCard icon={BookOpen} label={t('alerts.statCourses')} value={stats.courses} />
      </StatGrid>

      {/* Filter bar: status segmented control + severity + type chips */}
      <div className="space-y-2">
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
            <span className="text-xs text-muted-foreground">
              {t('alerts.severityFilterLabel')}
            </span>
            {ALERT_SEVERITIES.map((sev) => {
              const active = severityFilter.has(sev);
              return (
                <button
                  key={sev}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(setSeverityFilter, sev)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium transition',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    SEVERITY_TONE[sev].chip,
                    active && SEVERITY_TONE[sev].active,
                    active && 'ring-1 ring-current/40',
                  )}
                >
                  <span>{t(`alerts.severity.${sev}`)}</span>
                  <span className="tabular-nums opacity-70">{counts.bySeverity[sev]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('alerts.typeFilterLabel')}</span>
          {ALERT_TYPES.map((tp) => {
            const active = typeFilter.has(tp);
            return (
              <button
                key={tp}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(setTypeFilter, tp)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  TYPE_TONE[tp],
                  active && TYPE_ACTIVE[tp],
                  active && 'ring-1 ring-current/40',
                )}
              >
                <span>{t(`alerts.type.${tp}`)}</span>
                <span className="tabular-nums opacity-70">{counts.byType[tp]}</span>
              </button>
            );
          })}
          {severityFilter.size > 0 || typeFilter.size > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSeverityFilter(new Set());
                setTypeFilter(new Set());
              }}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
            >
              {t('alerts.clearTypeFilter')}
            </button>
          ) : null}
        </div>
      </div>

      {current.isLoading ? (
        <ListSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title={t('alerts.emptyTitle')}
          description={t('alerts.emptyDescription')}
        />
      ) : (
        <ul className="space-y-2">
          {grouped.map(([key, g]) => {
            // Actionable (open) view: groups default open; historical views
            // default closed. The set tracks the user's deviation from that.
            const defaultOpen = status === 'open';
            const isToggled = closedGroups.has(key);
            const isOpen = defaultOpen ? !isToggled : isToggled;
            const critical = g.alerts.filter((a) => a.severity === 'critical').length;
            const warning = g.alerts.filter((a) => a.severity === 'warning').length;
            return (
              <AlertGroup
                key={key}
                icon={key === '__system__' ? ShieldAlert : BookOpen}
                title={
                  g.course ? (
                    <>
                      {g.course.code}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {g.course.title}
                      </span>
                    </>
                  ) : (
                    t('alerts.systemGroup')
                  )
                }
                open={isOpen}
                onToggle={() => toggle(setClosedGroups, key)}
                count={g.alerts.length}
                critical={critical}
                warning={warning}
              >
                {g.alerts.map((a) => (
                  <AlertCard
                    key={a.id}
                    alert={a}
                    showStudent
                    actions={
                      a.status === 'open' ? (
                        <ActionIconButton
                          size="sm"
                          icon={CircleCheck}
                          label={t('alerts.resolveCta')}
                          color="emerald"
                          onClick={() => setResolving(a)}
                        />
                      ) : null
                    }
                  />
                ))}
              </AlertGroup>
            );
          })}
        </ul>
      )}

      <ResolveAlertDialog alert={resolving} onClose={() => setResolving(null)} />
    </div>
  );
}
