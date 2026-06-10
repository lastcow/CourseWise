import { useTranslation } from 'react-i18next';
import {
  Bell,
  BookOpen,
  CircleCheck,
  Clock,
  GraduationCap,
  PieChart,
  UserCog,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { useAdminDashboard } from '@/lib/queries';
import {
  AlertList,
  DashboardError,
  DashboardHeader,
  DashboardSkeleton,
  StatCard,
  StatGrid,
} from '@/components/dashboard/DashboardKit';
import { AdminActivityCard } from '@/components/dashboard/AdminActivityCard';

/** Band header shared by the dashboard panels (matches the grading pages). */
function PanelHeader({ icon: Icon, children }: { icon: typeof Bell; children: string }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 border-b bg-muted/30 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  total,
  barClassName,
}: {
  label: string;
  value: number;
  total: number;
  barClassName: string;
}): JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {value}
          <span className="font-normal text-muted-foreground"> / {total}</span>
        </span>
      </div>
      <Progress
        value={total > 0 ? (value / total) * 100 : 0}
        className="mt-1.5 h-1.5"
        barClassName={barClassName}
      />
    </div>
  );
}

export function AdminDashboardPage(): JSX.Element {
  const { t } = useTranslation();
  const dashboard = useAdminDashboard();

  return (
    <div className="space-y-6">
      <DashboardHeader title={t('dashboard.adminTitle')} subtitle={t('dashboard.subtitle')} />

      {dashboard.isLoading ? (
        <DashboardSkeleton stats={7} />
      ) : !dashboard.data ? (
        <DashboardError onRetry={() => void dashboard.refetch()} />
      ) : (
        <>
          <StatGrid>
            <StatCard icon={Users} label={t('dashboard.totalUsers')} value={dashboard.data.totals.users} />
            <StatCard icon={UserCog} label={t('dashboard.totalTeachers')} value={dashboard.data.totals.teachers} />
            <StatCard icon={GraduationCap} label={t('dashboard.totalStudents')} value={dashboard.data.totals.students} />
            <StatCard icon={BookOpen} label={t('dashboard.totalCourses')} value={dashboard.data.totals.courses} />
            <StatCard icon={CircleCheck} label={t('dashboard.activeCourses')} value={dashboard.data.totals.activeCourses} />
            <StatCard icon={Bell} tone="danger" label={t('dashboard.openAlerts')} value={dashboard.data.totals.openAlerts} />
            <StatCard icon={Clock} tone="alert" label={t('dashboard.late7dLabel')} value={dashboard.data.lateSubmissionsLast7d} />
          </StatGrid>

          <AdminActivityCard />

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <PanelHeader icon={Bell}>{t('dashboard.recentAlerts')}</PanelHeader>
              {dashboard.data.latestAlerts.length === 0 ? (
                <CardContent className="pt-6">
                  <EmptyState icon={<Bell className="h-6 w-6" />} title={t('alerts.emptyTitle')} />
                </CardContent>
              ) : (
                <AlertList alerts={dashboard.data.latestAlerts} showTime />
              )}
            </Card>

            <Card className="overflow-hidden">
              <PanelHeader icon={PieChart}>{t('dashboard.snapshotTitle')}</PanelHeader>
              <CardContent className="space-y-4 p-4">
                <SnapshotRow
                  label={t('dashboard.totalTeachers')}
                  value={dashboard.data.totals.teachers}
                  total={dashboard.data.totals.users}
                  barClassName="bg-sky-500"
                />
                <SnapshotRow
                  label={t('dashboard.totalStudents')}
                  value={dashboard.data.totals.students}
                  total={dashboard.data.totals.users}
                  barClassName="bg-emerald-500"
                />
                <SnapshotRow
                  label={t('dashboard.activeCourses')}
                  value={dashboard.data.totals.activeCourses}
                  total={dashboard.data.totals.courses}
                  barClassName="bg-violet-500"
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
