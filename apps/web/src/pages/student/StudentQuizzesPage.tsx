import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { useQuizzesList } from '@/lib/queries';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function StudentQuizzesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const list = useQuizzesList(cid);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t('quizzes.title')}</h2>
      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('quizzes.studentEmpty')} />
      ) : (
        <div className="grid gap-3">
          {list.data.map((q) => (
            <Card key={q.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{q.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {t('quizzes.questionsCount', { count: q.questionCount ?? 0 })} ·{' '}
                    {q.timeLimitMinutes
                      ? t('quizzes.timeLimitDisplay', { minutes: q.timeLimitMinutes })
                      : t('quizzes.noTimeLimit')}{' '}
                    · {q.startTime ? formatDate(q.startTime) : '—'} →{' '}
                    {q.endTime ? formatDate(q.endTime) : '—'}
                  </p>
                </div>
                <Badge variant={q.status === 'published' ? 'success' : 'secondary'}>
                  {t(`quizzes.status${q.status[0]!.toUpperCase()}${q.status.slice(1)}`)}
                </Badge>
              </CardHeader>
              <CardContent>
                {q.description ? (
                  <p className="text-sm text-muted-foreground">{q.description}</p>
                ) : null}
                {q.status === 'published' ? (
                  <Button asChild className="mt-3">
                    <Link to={`/student/courses/${cid}/quizzes/${q.id}`}>
                      {t('quizzes.takeQuiz')}
                    </Link>
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('quizzes.notAvailable')}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
