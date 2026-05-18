import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCourse } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function TeacherCourseShell(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const course = useCourse(courseId ?? null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>{course.data?.title ?? t('common.loading')}</CardTitle>
              <CardDescription className="font-mono text-xs">{course.data?.code}</CardDescription>
            </div>
            {course.data ? (
              <Badge variant={course.data.status === 'active' ? 'success' : 'secondary'}>
                {t(`courses.status${course.data.status[0]!.toUpperCase()}${course.data.status.slice(1)}`)}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {course.data?.description ?? '—'}
        </CardContent>
      </Card>
      <nav className="flex gap-2 border-b">
        {[
          { to: '', label: t('common.edit') },
          { to: 'modules', label: t('modules.title') },
          { to: 'materials', label: t('materials.title') },
        ].map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === ''}
            className={({ isActive }) =>
              cn(
                'border-b-2 px-3 py-2 text-sm font-medium',
                isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
