import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import {
  useCreatePresentation,
  useDeletePresentation,
  usePresentationsList,
  useTransitionPresentation,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';

export function TeacherPresentationsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = usePresentationsList(id);
  const create = useCreatePresentation(id);
  const transition = useTransitionPresentation(id);
  const del = useDeletePresentation(id);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await create.mutateAsync({ title: title.trim(), description: desc.trim() || null });
      toast.push({ title: t('presentations.created'), tone: 'success' });
      setOpen(false);
      setTitle('');
      setDesc('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('presentations.title')}</h2>
        <Button onClick={() => setOpen(true)}>{t('presentations.newCta')}</Button>
      </header>

      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('presentations.empty')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link
                      to={`/teacher/courses/${id}/presentations/${p.id}`}
                      className="hover:underline"
                    >
                      {p.title}
                    </Link>
                  </CardTitle>
                  <Badge variant={p.status === 'published' ? 'success' : 'secondary'}>
                    {t(`presentations.status${p.status[0]!.toUpperCase()}${p.status.slice(1)}`)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p className="line-clamp-2">{p.description ?? '—'}</p>
                <p>{t('presentations.slidesCount', { count: p.slideCount })}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/teacher/courses/${id}/presentations/${p.id}`}>
                      {t('common.edit')}
                    </Link>
                  </Button>
                  {p.status !== 'published' ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await transition.mutateAsync({ id: p.id, action: 'publish' });
                        toast.push({ title: t('presentations.published'), tone: 'success' });
                      }}
                    >
                      {t('presentations.publish')}
                    </Button>
                  ) : null}
                  {p.status !== 'archived' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await transition.mutateAsync({ id: p.id, action: 'archive' });
                        toast.push({ title: t('presentations.archived'), tone: 'success' });
                      }}
                    >
                      {t('presentations.archive')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm(t('presentations.deleteConfirm'))) return;
                      await del.mutateAsync(p.id);
                      toast.push({ title: t('presentations.deleted'), tone: 'success' });
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

      <Dialog open={open} onClose={() => setOpen(false)} title={t('presentations.createTitle')}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="p-title">{t('presentations.titleLabel')}</Label>
            <Input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="p-desc">{t('presentations.descriptionLabel')}</Label>
            <Input id="p-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
