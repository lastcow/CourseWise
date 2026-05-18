import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCourse, useModulesList } from '@/lib/queries';

export function StudentCourseOverviewPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const course = useCourse(id);
  const modules = useModulesList(id);

  if (course.isLoading) return <p>{t('common.loading')}</p>;
  if (!course.data) return <p>{t('common.error')}</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{course.data.title}</CardTitle>
          <CardDescription className="font-mono text-xs">{course.data.code}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{course.data.description ?? '—'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/student/courses/${id}/materials`}>{t('materials.title')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/student/courses/${id}/presentations`}>{t('presentations.title')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/student/courses/${id}/assignments`}>{t('assignments.title')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/student/courses/${id}/discussion`}>{t('discussion.title')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('modules.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {modules.isLoading ? (
            <p>{t('common.loading')}</p>
          ) : !modules.data || modules.data.length === 0 ? (
            <p className="text-muted-foreground">{t('modules.empty')}</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {modules.data.map((m) => (
                <li key={m.id}>
                  <span className="font-medium">{m.title}</span>
                  {m.description ? <span className="text-muted-foreground"> — {m.description}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
