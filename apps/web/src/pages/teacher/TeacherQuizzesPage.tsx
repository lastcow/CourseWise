import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Circle,
  CircleCheck,
  FolderInput,
  ListChecks,
  Lock,
  RefreshCw,
  SquarePen,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { Input, Label, Textarea } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import {
  useCreateQuiz,
  useDeleteQuiz,
  useModulesList,
  useQuizzesList,
  useTransitionQuiz,
  useUpdateQuiz,
} from '@/lib/queries';
import { ApiClientError, pickI18nKey } from '@/lib/api';
import type { QuizSummary } from '@coursewise/shared';

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  return `${formatShortDate(start)} → ${formatShortDate(end)}`;
}

function StatusIcon({ status }: { status: QuizSummary['status'] }): JSX.Element {
  const { t } = useTranslation();
  const label = t(`quizzes.status${status[0]!.toUpperCase()}${status.slice(1)}`);
  const { Icon, tone } = (() => {
    switch (status) {
      case 'published':
        return { Icon: CircleCheck, tone: 'border-emerald-500/60 text-emerald-500' };
      case 'closed':
        return { Icon: Lock, tone: 'border-sky-500/60 text-sky-500' };
      case 'archived':
        return { Icon: Archive, tone: 'border-orange-500/60 text-orange-500' };
      default:
        return { Icon: Circle, tone: 'border-slate-400/60 text-slate-400' };
    }
  })();
  return (
    <span
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border bg-transparent ${tone}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export function TeacherQuizzesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const navigate = useNavigate();
  const list = useQuizzesList(id);
  const create = useCreateQuiz(id);
  const transition = useTransitionQuiz(id);
  const del = useDeleteQuiz(id);
  const update = useUpdateQuiz(id);
  const modulesQ = useModulesList(id || null);
  const toast = useToast();

  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', timeLimitMinutes: '' });
  const [deleteTarget, setDeleteTarget] = useState<QuizSummary | null>(null);
  const [moveTarget, setMoveTarget] = useState<QuizSummary | null>(null);
  const [moveModuleId, setMoveModuleId] = useState<string>('');

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));

  return (
    <div className="space-y-4">
      <CourseSectionHeader
        title={t('quizzes.title')}
        count={list.data?.length}
        actions={
          <>
            <Button size="sm" onClick={() => setOpenCreate(true)}>
              {t('quizzes.newCta')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <RefreshCw
                className={list.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                aria-hidden
              />
            </Button>
          </>
        }
      />

      {list.isLoading ? (
        <ListSkeleton />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState icon={<ListChecks className="h-6 w-6" />} title={t('quizzes.empty')} />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('quizzes.colTitle')}</TableHead>
                <TableHead>{t('quizzes.colDescription')}</TableHead>
                <TableHead>{t('quizzes.colModule')}</TableHead>
                <TableHead className="text-right">{t('quizzes.colQuestions')}</TableHead>
                <TableHead>{t('quizzes.colWindow')}</TableHead>
                <TableHead className="text-right">{t('quizzes.colTimeLimit')}</TableHead>
                <TableHead className="text-right">{t('quizzes.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={q.status} />
                      <Link
                        to={`/teacher/courses/${id}/quizzes/${q.id}`}
                        className="hover:underline"
                      >
                        {q.title}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[24ch] text-muted-foreground">
                    <span className="line-clamp-1">{q.description ?? '—'}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-between gap-2">
                      <span className={q.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                        {q.moduleId ? (moduleTitleById.get(q.moduleId) ?? '—') : '—'}
                      </span>
                      <ActionIconButton
                        icon={FolderInput}
                        label={t('quizzes.linkModuleAction')}
                        color="sky"
                        size="sm"
                        onClick={() => {
                          setMoveModuleId(q.moduleId ?? '');
                          setMoveTarget(q);
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{q.questionCount ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatWindow(q.startTime, q.endTime)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {q.timeLimitMinutes ? `${q.timeLimitMinutes} min` : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <ActionIconButton
                        icon={SquarePen}
                        label={t('common.edit')}
                        color="yellow"
                        onClick={() => navigate(`/teacher/courses/${id}/quizzes/${q.id}`)}
                      />
                      <ActionIconButton
                        icon={Users}
                        label={t('quizzes.viewAttempts')}
                        color="teal"
                        onClick={() => navigate(`/teacher/courses/${id}/quizzes/${q.id}/attempts`)}
                      />
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
                          icon={Lock}
                          label={t('quizzes.close')}
                          color="sky"
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
                        onClick={() => setDeleteTarget(q)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} title={t('quizzes.newTitle')}>
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
            <Button variant="outline" onClick={() => setOpenCreate(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={create.isPending}
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
                  setOpenCreate(false);
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

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('quizzes.deleteDialogTitle')}
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">{t('quizzes.deleteConfirm')}</p>
        {deleteTarget ? <p className="mt-2 text-sm font-medium">{deleteTarget.title}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              if (!deleteTarget) return;
              try {
                await del.mutateAsync(deleteTarget.id);
                toast.push({ title: t('quizzes.deleted'), tone: 'success' });
                setDeleteTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {t('common.delete')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        title={t('quizzes.linkModuleTitle')}
        dismissOnBackdropClick={false}
      >
        <div className="space-y-2">
          <Label htmlFor="move-module">{t('quizzes.moduleLabel')}</Label>
          <select
            id="move-module"
            value={moveModuleId}
            onChange={(e) => setMoveModuleId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={modulesQ.isLoading}
          >
            <option value="">{t('quizzes.unassignedModule')}</option>
            {(modulesQ.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMoveTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={update.isPending}
            onClick={async () => {
              if (!moveTarget) return;
              try {
                await update.mutateAsync({
                  id: moveTarget.id,
                  input: { moduleId: moveModuleId || null },
                });
                toast.push({ title: t('quizzes.moduleUpdated'), tone: 'success' });
                setMoveTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
