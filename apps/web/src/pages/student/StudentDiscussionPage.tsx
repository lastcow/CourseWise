import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessagesSquare, Pin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { stripMarkdown } from '@/components/ui/markdown';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { useDiscussionTopicsList } from '@/lib/queries';

export function StudentDiscussionPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useDiscussionTopicsList(id);

  return (
    <div className="space-y-4">
      <CourseSectionHeader title={t('discussion.title')} count={list.data?.length} />
      {list.isLoading ? (
        <ListSkeleton />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare className="h-6 w-6" />}
          title={t('discussion.emptyStudent')}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((topic) => (
            <Card
              key={topic.id}
              className={
                'transition-colors hover:border-primary/40 ' +
                (topic.isPinned ? 'border-primary/40' : '')
              }
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                <CardTitle className="text-base">
                  <Link
                    to={`/student/courses/${id}/discussion/${topic.id}`}
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    {topic.isPinned ? (
                      <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                    ) : null}
                    {topic.title}
                  </Link>
                </CardTitle>
                {topic.isGraded ? (
                  <Badge variant="secondary">
                    {t('discussion.graded')} ({topic.maxScore})
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="line-clamp-2">
                  {topic.description ? stripMarkdown(topic.description) : '—'}
                </p>
                <p className="mt-3 text-xs">
                  {t('discussion.postCount', { count: topic.postCount ?? 0 })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
