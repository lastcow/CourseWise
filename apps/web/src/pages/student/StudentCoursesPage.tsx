import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { CourseCard } from '@/components/course/CourseCard';
import { JoinCourseDialog } from '@/components/course/JoinCourseDialog';
import { useCoursesList } from '@/lib/queries';

export function StudentCoursesPage(): JSX.Element {
  const { t } = useTranslation();
  const courses = useCoursesList();
  const [joinOpen, setJoinOpen] = useState(false);
  const courseCount = courses.data?.length ?? 0;
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('courses.title')}</h1>
        <Button
          variant={courseCount === 0 ? 'default' : 'outline'}
          onClick={() => setJoinOpen(true)}
        >
          {t('student.joinCourse.button')}
        </Button>
      </header>
      {courses.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !courses.data || courses.data.length === 0 ? (
        <EmptyState title={t('courses.empty')} description={t('courses.emptyStudent')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.data.map((c) => (
            <CourseCard key={c.id} course={c} hrefBase="/student/courses" />
          ))}
        </div>
      )}
      <JoinCourseDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </div>
  );
}
