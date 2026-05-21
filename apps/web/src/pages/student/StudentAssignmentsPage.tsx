import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { stripMarkdown } from '@/components/ui/markdown';
import { useAssignmentsList } from '@/lib/queries';
import type { SubmissionStatus } from '@coursewise/shared';

function due(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() > new Date(iso).getTime();
}

function submissionVariant(s: SubmissionStatus): 'success' | 'destructive' | 'secondary' {
  if (s === 'graded') return 'success';
  if (s === 'late' || s === 'returned') return 'destructive';
  if (s === 'submitted') return 'success';
  return 'secondary';
}

export function StudentAssignmentsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useAssignmentsList(id);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('assignments.title')}</h2>
      </header>
      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('assignments.emptyStudent')} />
      ) : (
        <div className="grid gap-3">
          {list.data.map((a) => {
            const mine = a.mySubmission ?? null;
            // "Submitted" only when the student has actually sent it. A
            // draft row exists from the first time they opened the form,
            // but we don't want to claim a submission for an empty draft.
            const hasSubmitted = mine && mine.status !== 'draft';
            return (
              <Card key={a.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <CardTitle className="text-base">
                    <Link
                      to={`/student/courses/${id}/assignments/${a.id}`}
                      className="hover:underline"
                    >
                      {a.title}
                    </Link>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {hasSubmitted ? (
                      <Badge variant={submissionVariant(mine!.status)}>
                        {t(
                          `submissions.status${mine!.status[0]!.toUpperCase()}${mine!.status.slice(1)}`,
                        )}
                      </Badge>
                    ) : null}
                    <Badge variant={a.status === 'closed' ? 'destructive' : 'success'}>
                      {t(`assignments.status${a.status[0]!.toUpperCase()}${a.status.slice(1)}`)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p className="line-clamp-2">{a.description ? stripMarkdown(a.description) : '—'}</p>
                  <p className="mt-2">
                    {t('assignments.dueLabel')}: {due(a.dueDate)}
                    {isOverdue(a.dueDate) && a.status !== 'closed' && !hasSubmitted ? (
                      <span className="ml-2 text-destructive">{t('assignments.overdue')}</span>
                    ) : null}
                  </p>
                  {hasSubmitted && mine!.submittedAt ? (
                    <p className="mt-1">
                      {t('submissions.submittedAtLabel', {
                        date: new Date(mine!.submittedAt).toLocaleString(),
                      })}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
