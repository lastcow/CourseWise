import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { CourseCard } from '@/components/course/CourseCard';
import { useCoursesList } from '@/lib/queries';

export function TeacherCoursesPage(): JSX.Element {
  const { t } = useTranslation();
  const courses = useCoursesList();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('courses.title')}</h1>
        <Button asChild>
          <Link to="/teacher/courses/new">{t('courses.newCta')}</Link>
        </Button>
      </header>
      {courses.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !courses.data || courses.data.length === 0 ? (
        <EmptyState
          title={t('courses.empty')}
          description={t('courses.emptyTeacher')}
          action={
            <Button asChild>
              <Link to="/teacher/courses/new">{t('courses.newCta')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.data.map((c) => (
            <CourseCard key={c.id} course={c} hrefBase="/teacher/courses" />
          ))}
        </div>
      )}
    </div>
  );
}
