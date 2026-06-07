import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Bell, BookOpen, CalendarCheck, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { useStudentDashboard } from '@/lib/queries';
import {
  AlertList,
  DashboardError,
  DashboardHeader,
  DashboardSkeleton,
  StatCard,
  StatGrid,
} from '@/components/dashboard/DashboardKit';

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
  const courses = useMemo(() => dashboard.data?.courses ?? [], [dashboard.data]);
  const stats = useMemo(() => {
    const withAtt = courses.filter((c) => c.attendanceRate !== null);
    const attAvg = withAtt.length
      ? `${Math.round((withAtt.reduce((s, c) => s + (c.attendanceRate ?? 0), 0) / withAtt.length) * 100)}%`
      : '—';
    return {
      courses: courses.length,
      attendance: attAvg,
      upcoming: courses.reduce((s, c) => s + c.upcomingAssignments, 0),
      alerts: courses.reduce((s, c) => s + c.openAlerts, 0),
    };
  }, [courses]);

  return (
    <div className="space-y-6">
      <DashboardHeader title={t('dashboard.studentTitle')} subtitle={t('dashboard.subtitle')} />

      {dashboard.isLoading ? (
        <DashboardSkeleton stats={4} />
      ) : !dashboard.data ? (
        <DashboardError onRetry={() => void dashboard.refetch()} />
      ) : (
        <>
          <StatGrid>
            <StatCard icon={BookOpen} label={t('dashboard.totalCourses')} value={stats.courses} />
            <StatCard icon={CalendarCheck} label={t('dashboard.attendance')} value={stats.attendance} />
            <StatCard icon={CalendarClock} label={t('dashboard.upcoming')} value={stats.upcoming} />
            <StatCard icon={Bell} tone="danger" label={t('dashboard.openAlerts')} value={stats.alerts} />
          </StatGrid>

          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle className="text-base">{t('dashboard.myCourses')}</CardTitle>
            </CardHeader>
            {courses.length === 0 ? (
              <CardContent className="pt-6">
                <EmptyState icon={<BookOpen className="h-6 w-6" />} title={t('courses.emptyStudent')} />
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('dashboard.course')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.attendance')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.assignmentAvg')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.quizAvg')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.upcoming')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.finalScore')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.map((c) => (
                    <TableRow key={c.courseId}>
                      <TableCell>
                        <Link
                          to={`/student/courses/${c.courseId}`}
                          className="font-medium hover:underline"
                        >
                          {c.courseTitle}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{c.courseCode}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(c.attendanceRate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(c.assignmentAverage)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.quizAverage)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.upcomingAssignments}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.finalScore !== null ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            {c.finalScore.toFixed(1)}
                            {c.letterGrade ? (
                              <Badge variant="secondary">{c.letterGrade}</Badge>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle className="text-base">{t('dashboard.alerts')}</CardTitle>
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
