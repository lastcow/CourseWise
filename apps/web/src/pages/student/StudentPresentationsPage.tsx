import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { usePresentationsList } from '@/lib/queries';

export function StudentPresentationsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = usePresentationsList(id);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('presentations.title')}</h2>
      </header>
      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('presentations.emptyStudent')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link
                    to={`/student/courses/${id}/presentations/${p.id}`}
                    className="hover:underline"
                  >
                    {p.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="line-clamp-2">{p.description ?? '—'}</p>
                <p className="mt-2">{t('presentations.slidesCount', { count: p.slideCount })}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
