import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { useStudentDashboard } from '@/lib/queries';

function pct(v: number | null): string {
  if (v === null) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

function fmt(v: number | null): string {
  if (v === null) return '—';
  return v.toFixed(1);
}

export function StudentDashboardPage(): JSX.Element {
  const { t } = useTranslation();
  const dashboard = useStudentDashboard();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">{t('dashboard.studentTitle')}</h2>
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
                <EmptyState title={t('courses.emptyStudent')} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3">{t('dashboard.course')}</th>
                        <th className="py-2 pr-3">{t('dashboard.attendance')}</th>
                        <th className="py-2 pr-3">{t('dashboard.assignmentAvg')}</th>
                        <th className="py-2 pr-3">{t('dashboard.quizAvg')}</th>
                        <th className="py-2 pr-3">{t('dashboard.upcoming')}</th>
                        <th className="py-2 pr-3">{t('dashboard.finalScore')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.data.courses.map((c) => (
                        <tr key={c.courseId} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <Link
                              to={`/student/courses/${c.courseId}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {c.courseTitle}
                            </Link>
                            <div className="font-mono text-xs text-muted-foreground">
                              {c.courseCode}
                            </div>
                          </td>
                          <td className="py-2 pr-3 font-mono">{pct(c.attendanceRate)}</td>
                          <td className="py-2 pr-3 font-mono">{fmt(c.assignmentAverage)}</td>
                          <td className="py-2 pr-3 font-mono">{fmt(c.quizAverage)}</td>
                          <td className="py-2 pr-3">{c.upcomingAssignments}</td>
                          <td className="py-2 pr-3 font-mono">
                            {c.finalScore !== null
                              ? `${c.finalScore.toFixed(1)} (${c.letterGrade ?? '—'})`
                              : '—'}
                          </td>
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
              <CardTitle>{t('dashboard.alerts')}</CardTitle>
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
