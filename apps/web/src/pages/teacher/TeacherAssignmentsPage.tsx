import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { stripMarkdown } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import {
  useAssignmentsList,
  useDeleteAssignment,
  useTransitionAssignment,
} from '@/lib/queries';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function TeacherAssignmentsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useAssignmentsList(id);
  const transition = useTransitionAssignment(id);
  const del = useDeleteAssignment(id);
  const toast = useToast();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('assignments.title')}</h2>
        <Button asChild>
          <Link to={`/teacher/courses/${id}/assignments/new`}>{t('assignments.newCta')}</Link>
        </Button>
      </header>

      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('assignments.empty')} />
      ) : (
        <div className="grid gap-3">
          {list.data.map((a) => (
            <Card key={a.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">
                    <Link
                      to={`/teacher/courses/${id}/assignments/${a.id}`}
                      className="hover:underline"
                    >
                      {a.title}
                    </Link>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {t('assignments.dueLabel')}: {formatDate(a.dueDate)} ·{' '}
                    {t('assignments.maxScore')}: {a.maxScore ?? '—'} ·{' '}
                    {t('assignments.submissionsCount', { count: a.submissionCount ?? 0 })}
                  </p>
                </div>
                <Badge
                  variant={
                    a.status === 'published'
                      ? 'success'
                      : a.status === 'closed'
                        ? 'secondary'
                        : 'secondary'
                  }
                >
                  {t(`assignments.status${a.status[0]!.toUpperCase()}${a.status.slice(1)}`)}
                </Badge>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="line-clamp-2">{a.description ? stripMarkdown(a.description) : '—'}</p>
                <div className="flex flex-wrap gap-2 pt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/teacher/courses/${id}/assignments/${a.id}`}>
                      {t('common.edit')}
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/teacher/courses/${id}/assignments/${a.id}/submissions`}>
                      {t('assignments.viewSubmissions')}
                    </Link>
                  </Button>
                  {a.status === 'draft' ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await transition.mutateAsync({ id: a.id, action: 'publish' });
                          toast.push({ title: t('assignments.published'), tone: 'success' });
                        } catch (err) {
                          toast.push({
                            title: t('assignments.publishBlocked'),
                            tone: 'error',
                          });
                        }
                      }}
                    >
                      {t('assignments.publish')}
                    </Button>
                  ) : null}
                  {a.status === 'published' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await transition.mutateAsync({ id: a.id, action: 'close' });
                      }}
                    >
                      {t('assignments.close')}
                    </Button>
                  ) : null}
                  {a.status !== 'archived' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await transition.mutateAsync({ id: a.id, action: 'archive' });
                      }}
                    >
                      {t('assignments.archive')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm(t('assignments.deleteConfirm'))) return;
                      await del.mutateAsync(a.id);
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
