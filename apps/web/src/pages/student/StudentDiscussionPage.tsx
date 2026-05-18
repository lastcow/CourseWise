import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { useDiscussionTopicsList } from '@/lib/queries';

export function StudentDiscussionPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useDiscussionTopicsList(id);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('discussion.title')}</h2>
      </header>
      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('discussion.emptyStudent')} />
      ) : (
        <div className="grid gap-3">
          {list.data.map((topic) => (
            <Card key={topic.id} className={topic.isPinned ? 'border-primary/40' : undefined}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <CardTitle className="text-base">
                  <Link
                    to={`/student/courses/${id}/discussion/${topic.id}`}
                    className="hover:underline"
                  >
                    {topic.isPinned ? '📌 ' : ''}
                    {topic.title}
                  </Link>
                </CardTitle>
                {topic.isGraded ? (
                  <Badge>
                    {t('discussion.graded')} ({topic.maxScore})
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="line-clamp-2">{topic.description ?? '—'}</p>
                <p className="mt-2">{t('discussion.postCount', { count: topic.postCount ?? 0 })}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
