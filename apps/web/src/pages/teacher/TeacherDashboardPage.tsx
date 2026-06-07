import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Bell, BookOpen, ClipboardCheck, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTeacherDashboard } from '@/lib/queries';
import {
  AlertList,
  DashboardError,
  DashboardHeader,
  DashboardSkeleton,
  StatCard,
  StatGrid,
} from '@/components/dashboard/DashboardKit';

/** A queue count: highlighted when there's work waiting, muted at zero. */
function Queue({ n, tone }: { n: number; tone: 'amber' | 'red' }): JSX.Element {
  if (n === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <span className={tone === 'red' ? 'font-medium text-destructive' : 'font-medium text-amber-600'}>
      {n}
    </span>
  );
}

export function TeacherDashboardPage(): JSX.Element {
  const { t } = useTranslation();
  const dashboard = useTeacherDashboard();
  const courses = useMemo(() => dashboard.data?.courses ?? [], [dashboard.data]);
  const stats = useMemo(
    () => ({
      courses: courses.length,
      enrolled: courses.reduce((s, c) => s + c.enrollmentCount, 0),
      toGrade: courses.reduce((s, c) => s + c.ungradedSubmissions + c.ungradedQuizAnswers, 0),
      alerts: courses.reduce((s, c) => s + c.openAlerts, 0),
    }),
    [courses],
  );

  return (
    <div className="space-y-6">
      <DashboardHeader title={t('dashboard.teacherTitle')} subtitle={t('dashboard.subtitle')} />

      {dashboard.isLoading ? (
        <DashboardSkeleton stats={4} />
      ) : !dashboard.data ? (
        <DashboardError onRetry={() => void dashboard.refetch()} />
      ) : (
        <>
          <StatGrid>
            <StatCard icon={BookOpen} label={t('dashboard.totalCourses')} value={stats.courses} />
            <StatCard icon={Users} label={t('dashboard.enrolled')} value={stats.enrolled} />
            <StatCard icon={ClipboardCheck} tone="alert" label={t('dashboard.toGradeLabel')} value={stats.toGrade} />
            <StatCard icon={Bell} tone="danger" label={t('dashboard.openAlerts')} value={stats.alerts} />
          </StatGrid>

          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle className="text-base">{t('dashboard.myCourses')}</CardTitle>
            </CardHeader>
            {courses.length === 0 ? (
              <CardContent className="pt-6">
                <EmptyState icon={<BookOpen className="h-6 w-6" />} title={t('courses.emptyTeacher')} />
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('dashboard.course')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.enrolled')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.ungradedSubmissions')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.ungradedQuizAnswers')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.openAlerts')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.map((c) => (
                    <TableRow key={c.courseId}>
                      <TableCell>
                        <Link
                          to={`/teacher/courses/${c.courseId}`}
                          className="font-medium hover:underline"
                        >
                          {c.courseTitle}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{c.courseCode}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.enrollmentCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Queue n={c.ungradedSubmissions} tone="amber" />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Queue n={c.ungradedQuizAnswers} tone="amber" />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Queue n={c.openAlerts} tone="red" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle className="text-base">{t('dashboard.recentAlerts')}</CardTitle>
            </CardHeader>
            {dashboard.data.recentAlerts.length === 0 ? (
              <CardContent className="pt-6">
                <EmptyState icon={<Bell className="h-6 w-6" />} title={t('alerts.emptyTitle')} />
              </CardContent>
            ) : (
              <AlertList alerts={dashboard.data.recentAlerts} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
