import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { stripMarkdown } from '@/components/ui/markdown';
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
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{c.title}</CardTitle>
                  <Badge variant={c.status === 'active' ? 'success' : 'secondary'}>
                    {t(`courses.status${c.status[0]!.toUpperCase()}${c.status.slice(1)}`)}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">{c.code}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground line-clamp-3">
                {c.description ? stripMarkdown(c.description) : '—'}
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link to={`/student/courses/${c.id}/materials`}>{t('materials.title')}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      <JoinCourseDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </div>
  );
}
