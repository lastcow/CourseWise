import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { stripMarkdown } from '@/components/ui/markdown';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import {
  useCreateDiscussionTopic,
  useDeleteDiscussionTopic,
  useDiscussionTopicsList,
  useTransitionDiscussionTopic,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';

export function TeacherDiscussionPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useDiscussionTopicsList(id);
  const create = useCreateDiscussionTopic(id);
  const transition = useTransitionDiscussionTopic(id);
  const del = useDeleteDiscussionTopic(id);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isGraded, setIsGraded] = useState(false);
  const [maxScore, setMaxScore] = useState<number | ''>('');

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        isGraded,
        maxScore: isGraded && maxScore !== '' ? Number(maxScore) : null,
      });
      toast.push({ title: t('discussion.topicCreated'), tone: 'success' });
      setOpen(false);
      setTitle('');
      setDescription('');
      setIsGraded(false);
      setMaxScore('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('discussion.title')}</h2>
        <Button onClick={() => setOpen(true)}>{t('discussion.newTopicCta')}</Button>
      </header>

      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('discussion.empty')} />
      ) : (
        <div className="grid gap-3">
          {list.data.map((topic) => (
            <Card key={topic.id} className={topic.isPinned ? 'border-primary/40' : undefined}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">
                    <Link
                      to={`/teacher/courses/${id}/discussion/${topic.id}`}
                      className="hover:underline"
                    >
                      {topic.isPinned ? '📌 ' : ''}
                      {topic.title}
                    </Link>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {t('discussion.postCount', { count: topic.postCount ?? 0 })}
                    {topic.isGraded ? ` · ${t('discussion.graded')} (${topic.maxScore})` : ''}
                  </p>
                </div>
                <Badge variant={topic.status === 'published' ? 'success' : 'secondary'}>
                  {t(`discussion.status${topic.status[0]!.toUpperCase()}${topic.status.slice(1)}`)}
                </Badge>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="line-clamp-2">{topic.description ? stripMarkdown(topic.description) : '—'}</p>
                <div className="flex flex-wrap gap-2 pt-3">
                  {topic.status === 'draft' ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await transition.mutateAsync({ id: topic.id, action: 'publish' });
                      }}
                    >
                      {t('discussion.publish')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      transition.mutate({ id: topic.id, action: topic.isPinned ? 'unpin' : 'pin' })
                    }
                  >
                    {topic.isPinned ? t('discussion.unpin') : t('discussion.pin')}
                  </Button>
                  {topic.status !== 'archived' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => transition.mutate({ id: topic.id, action: 'archive' })}
                    >
                      {t('discussion.archive')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm(t('discussion.deleteConfirm'))) return;
                      await del.mutateAsync(topic.id);
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

      <Dialog open={open} onClose={() => setOpen(false)} title={t('discussion.newTopicTitle')}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="topic-title">{t('discussion.titleLabel')}</Label>
            <Input id="topic-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="topic-desc">{t('discussion.descriptionLabel')}</Label>
            <MarkdownEditor id="topic-desc" value={description} onChange={setDescription} />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="topic-graded"
              type="checkbox"
              checked={isGraded}
              onChange={(e) => setIsGraded(e.target.checked)}
            />
            <Label htmlFor="topic-graded">{t('discussion.isGraded')}</Label>
          </div>
          {isGraded ? (
            <div>
              <Label htmlFor="topic-max">{t('discussion.maxScore')}</Label>
              <Input
                id="topic-max"
                type="number"
                min={1}
                step={0.5}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
          ) : null}
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
