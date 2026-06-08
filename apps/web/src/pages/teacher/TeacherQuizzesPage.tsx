import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  Circle,
  CircleCheck,
  FolderInput,
  Layers,
  ListChecks,
  Lock,
  RefreshCw,
  SquarePen,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
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
  useAssignmentGroups,
  useCreateQuiz,
  useCreateQuizSet,
  useDeleteQuiz,
  useDeleteQuizSet,
  useModulesList,
  useQuizSets,
  useQuizzesList,
  useTransitionQuiz,
  useUpdateQuiz,
  useUpdateQuizSet,
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
  const groupsQ = useAssignmentGroups(id || undefined);
  const setsQ = useQuizSets(id || undefined);
  const createSet = useCreateQuizSet(id);
  const updateSet = useUpdateQuizSet(id);
  const deleteSet = useDeleteQuizSet(id);
  const toast = useToast();

  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', timeLimitMinutes: '' });
  const [deleteTarget, setDeleteTarget] = useState<QuizSummary | null>(null);
  const [unarchiveTarget, setUnarchiveTarget] = useState<QuizSummary | null>(null);
  const [moveTarget, setMoveTarget] = useState<QuizSummary | null>(null);
  const [moveModuleId, setMoveModuleId] = useState<string>('');
  const [manageOpen, setManageOpen] = useState(false);

  // Multi-select → quiz-set assignment (mirrors the assignments page).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [setMode, setSetMode] = useState<'new' | 'existing'>('new');
  const [newSetName, setNewSetName] = useState('');
  const [newSetCategory, setNewSetCategory] = useState('');
  const [newSetRule, setNewSetRule] = useState<'average' | 'highest'>('average');
  const [existingSetId, setExistingSetId] = useState('');

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));
  const groupList = groupsQ.data ?? [];
  const setList = setsQ.data ?? [];
  const setById = new Map(setList.map((s) => [s.id, s]));
  const quizList = list.data ?? [];

  const allVisibleSelected =
    quizList.length > 0 && quizList.every((q) => selectedIds.has(q.id));

  function toggleRow(qid: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  }

  function toggleAll(): void {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(quizList.map((q) => q.id)));
  }

  async function onGroupIntoSet(): Promise<void> {
    try {
      let targetSetId = existingSetId;
      if (setMode === 'new') {
        if (!newSetName.trim()) {
          toast.push({ title: t('quizzes.sets.nameRequired'), tone: 'error' });
          return;
        }
        const created = await createSet.mutateAsync({
          name: newSetName.trim(),
          groupId: newSetCategory || null,
          scoringRule: newSetRule,
        });
        targetSetId = created.id;
      }
      if (!targetSetId) {
        toast.push({ title: t('quizzes.sets.pickRequired'), tone: 'error' });
        return;
      }
      await Promise.all(
        [...selectedIds].map((qid) =>
          update.mutateAsync({ id: qid, input: { setId: targetSetId } }),
        ),
      );
      toast.push({ title: t('quizzes.sets.assigned'), tone: 'success' });
      setGroupDialogOpen(false);
      setSelectedIds(new Set());
      setNewSetName('');
      setNewSetCategory('');
      setNewSetRule('average');
      setExistingSetId('');
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onRemoveFromSet(qid: string): Promise<void> {
    try {
      await update.mutateAsync({ id: qid, input: { setId: null } });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onUpdateSetField(
    setId: string,
    patch: { name?: string; groupId?: string | null; scoringRule?: 'average' | 'highest' },
  ): Promise<void> {
    try {
      await updateSet.mutateAsync({ setId, ...patch });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onDeleteSet(setId: string, name: string): Promise<void> {
    // eslint-disable-next-line no-alert
    if (!confirm(t('quizzes.sets.deleteConfirm', { name }))) return;
    try {
      await deleteSet.mutateAsync(setId);
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

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
        <div className="space-y-3">
          {/* Bulk-select tools sit next to the table they act on. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={selectedIds.size === 0}
              onClick={() => setGroupDialogOpen(true)}
            >
              <Layers className="h-4 w-4" aria-hidden />
              {t('quizzes.sets.groupIntoSet', { count: selectedIds.size })}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setManageOpen(true)}>
              {t('quizzes.manageSets')}
            </Button>
          </div>
          <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label={t('quizzes.sets.selectAll')}
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer align-middle"
                  />
                </TableHead>
                <TableHead>{t('quizzes.colTitle')}</TableHead>
                <TableHead>{t('quizzes.sets.colSet')}</TableHead>
                <TableHead>{t('quizzes.colDescription')}</TableHead>
                <TableHead>{t('quizzes.colModule')}</TableHead>
                <TableHead className="text-right">{t('quizzes.colQuestions')}</TableHead>
                <TableHead>{t('quizzes.colWindow')}</TableHead>
                <TableHead className="text-right">{t('quizzes.colTimeLimit')}</TableHead>
                <TableHead className="text-right">{t('quizzes.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quizList.map((q) => (
                <TableRow key={q.id} data-state={selectedIds.has(q.id) ? 'selected' : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={t('quizzes.sets.selectRow', { title: q.title })}
                      checked={selectedIds.has(q.id)}
                      onChange={() => toggleRow(q.id)}
                      className="h-4 w-4 cursor-pointer align-middle"
                    />
                  </TableCell>
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
                  <TableCell>
                    {q.setId && setById.get(q.setId) ? (
                      <Badge variant="secondary" className="gap-1">
                        <Layers className="h-3 w-3" aria-hidden />
                        {setById.get(q.setId)!.name}
                        <button
                          type="button"
                          aria-label={t('quizzes.sets.removeFromSet')}
                          title={t('quizzes.sets.removeFromSet')}
                          onClick={() => void onRemoveFromSet(q.id)}
                          className="ml-0.5 rounded hover:text-foreground"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
                      ) : (
                        <ActionIconButton
                          icon={ArchiveRestore}
                          label={t('quizzes.unarchive')}
                          color="emerald"
                          onClick={() => setUnarchiveTarget(q)}
                        />
                      )}
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
        open={unarchiveTarget !== null}
        onClose={() => setUnarchiveTarget(null)}
        title={t('quizzes.unarchiveDialogTitle')}
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">{t('quizzes.unarchiveConfirm')}</p>
        {unarchiveTarget ? (
          <p className="mt-2 text-sm font-medium">{unarchiveTarget.title}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setUnarchiveTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={transition.isPending}
            onClick={async () => {
              if (!unarchiveTarget) return;
              try {
                await transition.mutateAsync({ id: unarchiveTarget.id, action: 'unarchive' });
                toast.push({ title: t('quizzes.unarchived'), tone: 'success' });
                setUnarchiveTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {t('quizzes.unarchive')}
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

      <Dialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title={t('quizzes.sets.manageTitle')}
        className="max-w-3xl"
      >
        <p className="text-sm text-muted-foreground">{t('quizzes.sets.manageHint')}</p>
        {setList.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('quizzes.sets.empty')}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {setList.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <Input
                  defaultValue={s.name}
                  aria-label={t('quizzes.sets.name')}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== s.name) void onUpdateSetField(s.id, { name: next });
                  }}
                  className="min-w-0 flex-1"
                />
                <select
                  aria-label={t('quizzes.sets.category')}
                  className="h-10 w-32 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                  value={s.groupId ?? ''}
                  onChange={(e) => void onUpdateSetField(s.id, { groupId: e.target.value || null })}
                >
                  <option value="">{t('quizzes.sets.noCategory')}</option>
                  {groupList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('quizzes.sets.rule')}
                  className="h-10 w-28 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                  value={s.scoringRule}
                  onChange={(e) =>
                    void onUpdateSetField(s.id, {
                      scoringRule: e.target.value as 'average' | 'highest',
                    })
                  }
                >
                  <option value="average">{t('grading.setRuleAverage')}</option>
                  <option value="highest">{t('grading.setRuleHighest')}</option>
                </select>
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                  {t('quizzes.sets.members', { count: s.memberCount ?? 0 })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void onDeleteSet(s.id, s.name)}
                  disabled={deleteSet.isPending}
                >
                  {t('common.delete')}
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => setManageOpen(false)}>
            {t('common.close')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={groupDialogOpen}
        onClose={() => setGroupDialogOpen(false)}
        title={t('quizzes.sets.dialogTitle', { count: selectedIds.size })}
        dismissOnBackdropClick={false}
      >
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="quiz-set-mode"
                checked={setMode === 'new'}
                onChange={() => setSetMode('new')}
              />
              {t('quizzes.sets.modeNew')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="quiz-set-mode"
                checked={setMode === 'existing'}
                onChange={() => setSetMode('existing')}
                disabled={setList.length === 0}
              />
              {t('quizzes.sets.modeExisting')}
            </label>
          </div>

          {setMode === 'new' ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="quiz-set-name">{t('quizzes.sets.name')}</Label>
                <Input
                  id="quiz-set-name"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder={t('quizzes.sets.namePlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quiz-set-category">{t('quizzes.sets.category')}</Label>
                <select
                  id="quiz-set-category"
                  value={newSetCategory}
                  onChange={(e) => setNewSetCategory(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{t('quizzes.sets.noCategory')}</option>
                  {groupList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="quiz-set-rule">{t('quizzes.sets.rule')}</Label>
                <select
                  id="quiz-set-rule"
                  value={newSetRule}
                  onChange={(e) => setNewSetRule(e.target.value as 'average' | 'highest')}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="average">{t('grading.setRuleAverage')}</option>
                  <option value="highest">{t('grading.setRuleHighest')}</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="quiz-set-existing">{t('quizzes.sets.existing')}</Label>
              <select
                id="quiz-set-existing"
                value={existingSetId}
                onChange={(e) => setExistingSetId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('quizzes.sets.pickPlaceholder')}</option>
                {setList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={createSet.isPending || update.isPending}
            onClick={() => void onGroupIntoSet()}
          >
            {t('quizzes.sets.assignCta')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
