import { useTranslation } from 'react-i18next';
import { Bell, BookOpen, CircleCheck, Clock, GraduationCap, UserCog, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { useAdminDashboard } from '@/lib/queries';
import {
  AlertList,
  DashboardError,
  DashboardHeader,
  DashboardSkeleton,
  StatCard,
  StatGrid,
} from '@/components/dashboard/DashboardKit';

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

          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle className="text-base">{t('dashboard.recentAlerts')}</CardTitle>
            </CardHeader>
            {dashboard.data.latestAlerts.length === 0 ? (
              <CardContent className="pt-6">
                <EmptyState icon={<Bell className="h-6 w-6" />} title={t('alerts.emptyTitle')} />
              </CardContent>
            ) : (
              <AlertList alerts={dashboard.data.latestAlerts} showTime />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
