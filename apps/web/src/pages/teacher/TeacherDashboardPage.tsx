import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { useTeacherDashboard } from '@/lib/queries';

export function TeacherDashboardPage(): JSX.Element {
  const { t } = useTranslation();
  const dashboard = useTeacherDashboard();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">{t('dashboard.teacherTitle')}</h2>
      {dashboard.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !dashboard.data ? (
        <p>{t('common.error')}</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.myCourses')}</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.data.courses.length === 0 ? (
                <EmptyState title={t('courses.emptyTeacher')} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3">{t('dashboard.course')}</th>
                        <th className="py-2 pr-3">{t('dashboard.enrolled')}</th>
                        <th className="py-2 pr-3">{t('dashboard.ungradedSubmissions')}</th>
                        <th className="py-2 pr-3">{t('dashboard.ungradedQuizAnswers')}</th>
                        <th className="py-2 pr-3">{t('dashboard.openAlerts')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.data.courses.map((c) => (
                        <tr key={c.courseId} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <Link
                              to={`/teacher/courses/${c.courseId}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {c.courseTitle}
                            </Link>
                            <div className="font-mono text-xs text-muted-foreground">
                              {c.courseCode}
                            </div>
                          </td>
                          <td className="py-2 pr-3 font-mono">{c.enrollmentCount}</td>
                          <td className="py-2 pr-3 font-mono">{c.ungradedSubmissions}</td>
                          <td className="py-2 pr-3 font-mono">{c.ungradedQuizAnswers}</td>
                          <td className="py-2 pr-3 font-mono">{c.openAlerts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.recentAlerts')}</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.data.recentAlerts.length === 0 ? (
                <EmptyState title={t('alerts.emptyTitle')} />
              ) : (
                <ul className="space-y-2">
                  {dashboard.data.recentAlerts.map((a) => (
                    <li key={a.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{t(`alerts.severity.${a.severity}`)}</Badge>
                        <Badge variant="outline">{t(`alerts.type.${a.type}`)}</Badge>
                        <span className="font-medium">{a.title}</span>
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
