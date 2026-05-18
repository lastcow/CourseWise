import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { useAdminDashboard } from '@/lib/queries';

export function AdminDashboardPage(): JSX.Element {
  const { t } = useTranslation();
  const dashboard = useAdminDashboard();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">{t('dashboard.adminTitle')}</h2>
      {dashboard.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !dashboard.data ? (
        <p>{t('common.error')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label={t('dashboard.totalUsers')} value={dashboard.data.totals.users} />
            <StatCard label={t('dashboard.totalTeachers')} value={dashboard.data.totals.teachers} />
            <StatCard label={t('dashboard.totalStudents')} value={dashboard.data.totals.students} />
            <StatCard label={t('dashboard.totalCourses')} value={dashboard.data.totals.courses} />
            <StatCard
              label={t('dashboard.activeCourses')}
              value={dashboard.data.totals.activeCourses}
            />
            <StatCard label={t('dashboard.openAlerts')} value={dashboard.data.totals.openAlerts} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.activitySummary')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {t('dashboard.lateSubmissions7d', {
                  count: dashboard.data.lateSubmissionsLast7d,
                })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.recentAlerts')}</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.data.latestAlerts.length === 0 ? (
                <EmptyState title={t('alerts.emptyTitle')} />
              ) : (
                <ul className="space-y-2">
                  {dashboard.data.latestAlerts.map((a) => (
                    <li key={a.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{t(`alerts.severity.${a.severity}`)}</Badge>
                        <Badge variant="outline">{t(`alerts.type.${a.type}`)}</Badge>
                        <span className="font-medium">{a.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {a.body ? (
                        <p className="mt-1 text-xs text-muted-foreground">{a.body}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
