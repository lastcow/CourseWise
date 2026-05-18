import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, CircleCheck, Pencil, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import {
  useCreateQuiz,
  useDeleteQuiz,
  useQuizzesList,
  useTransitionQuiz,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function TeacherQuizzesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useQuizzesList(id);
  const create = useCreateQuiz(id);
  const transition = useTransitionQuiz(id);
  const del = useDeleteQuiz(id);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', timeLimitMinutes: '' });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('quizzes.title')}</h2>
        <Button onClick={() => setOpen(true)}>{t('quizzes.newCta')}</Button>
      </header>

      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('quizzes.empty')} />
      ) : (
        <div className="grid gap-3">
          {list.data.map((q) => (
            <Card key={q.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">
                    <Link
                      to={`/teacher/courses/${id}/quizzes/${q.id}`}
                      className="hover:underline"
                    >
                      {q.title}
                    </Link>
                  </CardTitle>
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
              <CardContent className="text-sm text-muted-foreground">
                <p className="line-clamp-2">{q.description ?? '—'}</p>
                <div className="flex flex-wrap items-center gap-1.5 pt-3">
                  <ActionIconButton
                    asChild
                    icon={Pencil}
                    label={t('common.edit')}
                    color="yellow"
                  >
                    <Link to={`/teacher/courses/${id}/quizzes/${q.id}`} />
                  </ActionIconButton>
                  <ActionIconButton
                    asChild
                    icon={Users}
                    label={t('quizzes.viewAttempts')}
                    color="teal"
                  >
                    <Link to={`/teacher/courses/${id}/quizzes/${q.id}/attempts`} />
                  </ActionIconButton>
                  {q.status === 'draft' ? (
                    <ActionIconButton
                      icon={CircleCheck}
                      label={t('quizzes.publish')}
                      color="emerald"
                      onClick={async () => {
                        try {
                          await transition.mutateAsync({ id: q.id, action: 'publish' });
                          toast.push({ title: t('quizzes.published'), tone: 'success' });
                        } catch (err) {
                          toast.push({
                            title: t(pickI18nKey(err, 'quizzes.publishBlocked')),
                            tone: 'error',
                          });
                        }
                      }}
                    />
                  ) : null}
                  {q.status === 'published' ? (
                    <ActionIconButton
                      icon={CircleCheck}
                      label={t('quizzes.close')}
                      color="emerald"
                      onClick={async () => {
                        await transition.mutateAsync({ id: q.id, action: 'close' });
                        toast.push({ title: t('quizzes.closed'), tone: 'success' });
                      }}
                    />
                  ) : null}
                  {q.status !== 'archived' ? (
                    <ActionIconButton
                      icon={Archive}
                      label={t('quizzes.archive')}
                      color="orange"
                      onClick={async () => {
                        await transition.mutateAsync({ id: q.id, action: 'archive' });
                        toast.push({ title: t('quizzes.archived'), tone: 'success' });
                      }}
                    />
                  ) : null}
                  <ActionIconButton
                    icon={Trash2}
                    label={t('common.delete')}
                    color="red"
                    onClick={async () => {
                      if (!confirm(t('quizzes.deleteConfirm'))) return;
                      await del.mutateAsync(q.id);
                      toast.push({ title: t('quizzes.deleted'), tone: 'success' });
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={t('quizzes.newTitle')}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="quiz-title">{t('quizzes.titleLabel')}</Label>
            <Input
              id="quiz-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="quiz-desc">{t('quizzes.descriptionLabel')}</Label>
            <Textarea
              id="quiz-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="quiz-tl">{t('quizzes.timeLimit')}</Label>
            <Input
              id="quiz-tl"
              type="number"
              min={1}
              value={form.timeLimitMinutes}
              onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={async () => {
                if (!form.title.trim()) return;
                try {
                  await create.mutateAsync({
                    title: form.title.trim(),
                    description: form.description.trim() || null,
                    timeLimitMinutes: form.timeLimitMinutes
                      ? Number.parseInt(form.timeLimitMinutes, 10)
                      : null,
                  });
                  setOpen(false);
                  setForm({ title: '', description: '', timeLimitMinutes: '' });
                  toast.push({ title: t('quizzes.created'), tone: 'success' });
                } catch (err) {
                  toast.push({
                    title: t(pickI18nKey(err, 'errors.internal')),
                    tone: 'error',
                  });
                }
              }}
            >
              {t('common.create')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
