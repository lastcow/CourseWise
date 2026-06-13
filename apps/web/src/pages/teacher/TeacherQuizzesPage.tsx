import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Circle,
  CircleCheck,
  FolderInput,
  Inbox,
  Layers,
  ListChecks,
  Lock,
  Plus,
  RefreshCw,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { ActionMenu, ActionMenuItem } from '@/components/ui/action-menu';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { SetWeightsEditor } from '@/components/sets/SetWeightsEditor';
import { QuizAttemptsSubsection } from '@/components/submissions/QuizAttemptsSubsection';
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
import { useConfirm } from '@/components/ui/confirm';
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
import { cn } from '@/lib/utils';
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
  const confirm = useConfirm();

  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', timeLimitMinutes: '' });
  const [deleteTarget, setDeleteTarget] = useState<QuizSummary | null>(null);
  const [unarchiveTarget, setUnarchiveTarget] = useState<QuizSummary | null>(null);
  const [moveTarget, setMoveTarget] = useState<QuizSummary | null>(null);
  const [moveModuleId, setMoveModuleId] = useState<string>('');
  const [manageOpen, setManageOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Per-quiz expand-to-view attempts subsection (keyed by id).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (quizId: string): void =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(quizId)) next.delete(quizId);
      else next.add(quizId);
      return next;
    });

  // Multi-select → quiz-set assignment (mirrors the assignments page).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [setMode, setSetMode] = useState<'new' | 'existing'>('new');
  const [newSetName, setNewSetName] = useState('');
  const [newSetCategory, setNewSetCategory] = useState('');
  const [newSetRule, setNewSetRule] = useState<'average' | 'highest' | 'weighted'>('average');
  const [newSetWeights, setNewSetWeights] = useState<Record<string, number>>({});
  const [existingSetId, setExistingSetId] = useState('');
  // Manage-sets dialog: unsaved per-set weight drafts, keyed by set id.
  const [weightsDraft, setWeightsDraft] = useState<Record<string, Record<string, number>>>({});

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));
  const groupList = groupsQ.data ?? [];
  const setList = setsQ.data ?? [];
  const setById = new Map(setList.map((s) => [s.id, s]));
  const quizList = list.data ?? [];

  const filteredQuizzes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = list.data ?? [];
    if (!q) return all;
    return all.filter((quiz) => {
      if (quiz.title.toLowerCase().includes(q)) return true;
      const moduleTitle = quiz.moduleId ? moduleTitleById.get(quiz.moduleId) : undefined;
      return moduleTitle ? moduleTitle.toLowerCase().includes(q) : false;
    });
    // moduleTitleById is rebuilt every render from modulesQ.data, so depend on
    // the underlying data rather than the Map identity.
  }, [search, list.data, modulesQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const allVisibleSelected =
    filteredQuizzes.length > 0 && filteredQuizzes.every((q) => selectedIds.has(q.id));

  function toggleRow(qid: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  }

  function toggleAll(): void {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredQuizzes.map((q) => q.id)));
  }

  // Run a quiz transition and surface a success/error toast — the shared
  // try/catch the per-quiz action-menu items delegate to.
  async function runQuizAction(
    fn: () => Promise<unknown>,
    successKey: string,
    errorKey = 'errors.internal',
  ): Promise<void> {
    try {
      await fn();
      toast.push({ title: t(successKey), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, errorKey)), tone: 'error' });
    }
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
          memberWeights: newSetRule === 'weighted' ? newSetWeights : undefined,
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
      setNewSetWeights({});
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
    patch: {
      name?: string;
      groupId?: string | null;
      scoringRule?: 'average' | 'highest' | 'weighted';
      memberWeights?: Record<string, number> | null;
    },
  ): Promise<void> {
    try {
      await updateSet.mutateAsync({ setId, ...patch });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onDeleteSet(setId: string, name: string): Promise<void> {
    const ok = await confirm({
      title: t('quizzes.sets.deleteTitle'),
      description: t('quizzes.sets.deleteBody'),
      detail: { name },
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    try {
      await deleteSet.mutateAsync(setId);
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <div className="space-y-4">
      <CourseSectionHeader title={t('quizzes.title')} count={list.data?.length} />

      {list.isLoading ? (
        <ListSkeleton />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-6 w-6" />}
          title={t('quizzes.empty')}
          action={<Button onClick={() => setOpenCreate(true)}>{t('quizzes.newCta')}</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          {/* Toolbar attached to the table: search + set operations on the
              left; new quiz (icon-only) and refresh on the right, with a
              vertical separator before refresh. */}
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('quizzes.searchPlaceholder')}
              className="h-8 w-full sm:w-60"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={selectedIds.size === 0}
              onClick={() => setGroupDialogOpen(true)}
            >
              <Layers className="h-4 w-4" aria-hidden />
              {t('quizzes.sets.groupIntoSet', { count: selectedIds.size })}
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setManageOpen(true)}>
              {t('quizzes.manageSets')}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <ActionIconButton
                icon={Plus}
                label={t('quizzes.newCta')}
                color="emerald"
                size="sm"
                onClick={() => setOpenCreate(true)}
              />
              <div className="mx-1 h-5 w-px bg-border" aria-hidden />
              <ActionIconButton
                icon={RefreshCw}
                label={t('common.refresh')}
                color="sky"
                size="sm"
                onClick={() => void list.refetch()}
                disabled={list.isFetching}
                className={cn(list.isFetching && '[&_svg]:animate-spin')}
              />
            </div>
          </div>

          {filteredQuizzes.length === 0 ? (
            <EmptyState title={t('quizzes.noMatches')} />
          ) : (
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
                  <TableHead className="text-right">{t('quizzes.colQuestions')}</TableHead>
                  <TableHead>{t('quizzes.colWindow')}</TableHead>
                  <TableHead className="text-right">{t('quizzes.colTimeLimit')}</TableHead>
                  <TableHead className="text-right">{t('quizzes.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuizzes.map((q) => {
                  const isOpen = expanded.has(q.id);
                  return (
                  <Fragment key={q.id}>
                  <TableRow data-state={selectedIds.has(q.id) ? 'selected' : undefined}>
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
                        <button
                          type="button"
                          onClick={() => toggleExpanded(q.id)}
                          aria-expanded={isOpen}
                          aria-label={
                            isOpen
                              ? t('quizzes.collapseAttempts')
                              : t('quizzes.expandAttempts')
                          }
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ChevronRight
                            className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')}
                            aria-hidden
                          />
                        </button>
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
                    <TableCell className="text-right tabular-nums">{q.questionCount ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatWindow(q.startTime, q.endTime)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {q.timeLimitMinutes ? `${q.timeLimitMinutes} min` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <ViewAttemptsButton
                          label={t('quizzes.viewAttempts')}
                          pending={q.pendingReviewCount ?? 0}
                          total={q.attemptCount ?? 0}
                          onClick={() =>
                            navigate(`/teacher/courses/${id}/quizzes/${q.id}/attempts`)
                          }
                        />
                        <ActionMenu label={t('quizzes.colActions')} size="sm">
                          <ActionMenuItem
                            icon={SquarePen}
                            onSelect={() => navigate(`/teacher/courses/${id}/quizzes/${q.id}`)}
                          >
                            {t('common.edit')}
                          </ActionMenuItem>
                          <ActionMenuItem
                            icon={FolderInput}
                            onSelect={() => {
                              setMoveModuleId(q.moduleId ?? '');
                              setMoveTarget(q);
                            }}
                          >
                            {t('quizzes.linkModuleAction')}
                          </ActionMenuItem>
                          {q.status === 'draft' ? (
                            <ActionMenuItem
                              icon={CircleCheck}
                              onSelect={() =>
                                void runQuizAction(
                                  () => transition.mutateAsync({ id: q.id, action: 'publish' }),
                                  'quizzes.published',
                                  'quizzes.publishBlocked',
                                )
                              }
                            >
                              {t('quizzes.publish')}
                            </ActionMenuItem>
                          ) : null}
                          {q.status === 'published' ? (
                            <ActionMenuItem
                              icon={Lock}
                              onSelect={() =>
                                void runQuizAction(
                                  () => transition.mutateAsync({ id: q.id, action: 'close' }),
                                  'quizzes.closed',
                                )
                              }
                            >
                              {t('quizzes.close')}
                            </ActionMenuItem>
                          ) : null}
                          {q.status !== 'archived' ? (
                            <ActionMenuItem
                              icon={Archive}
                              onSelect={() =>
                                void runQuizAction(
                                  () => transition.mutateAsync({ id: q.id, action: 'archive' }),
                                  'quizzes.archived',
                                )
                              }
                            >
                              {t('quizzes.archive')}
                            </ActionMenuItem>
                          ) : (
                            <ActionMenuItem
                              icon={ArchiveRestore}
                              onSelect={() => setUnarchiveTarget(q)}
                            >
                              {t('quizzes.unarchive')}
                            </ActionMenuItem>
                          )}
                          <ActionMenuItem
                            icon={Trash2}
                            tone="destructive"
                            onSelect={() => setDeleteTarget(q)}
                          >
                            {t('common.delete')}
                          </ActionMenuItem>
                        </ActionMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen ? (
                    <TableRow className="bg-muted/20">
                      <TableCell />
                      <TableCell colSpan={6} className="py-3 pr-4">
                        <QuizAttemptsSubsection courseId={id} quizId={q.id} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
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
            {setList.map((s) => {
              const setMembers = quizList
                .filter((q) => q.setId === s.id)
                .map((q) => ({ id: q.id, title: q.title }));
              const draft = weightsDraft[s.id] ?? s.memberWeights ?? {};
              const dirty = weightsDraft[s.id] !== undefined;
              return (
                <div key={s.id} className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center gap-2">
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
                      onChange={(e) =>
                        void onUpdateSetField(s.id, { groupId: e.target.value || null })
                      }
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
                          scoringRule: e.target.value as 'average' | 'highest' | 'weighted',
                        })
                      }
                    >
                      <option value="average">{t('grading.setRuleAverage')}</option>
                      <option value="highest">{t('grading.setRuleHighest')}</option>
                      <option value="weighted">{t('grading.setRuleWeighted')}</option>
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
                  {s.scoringRule === 'weighted' && setMembers.length > 0 ? (
                    <>
                      <SetWeightsEditor
                        members={setMembers}
                        weights={draft}
                        onChange={(next) =>
                          setWeightsDraft((cur) => ({ ...cur, [s.id]: next }))
                        }
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          disabled={!dirty || updateSet.isPending}
                          onClick={async () => {
                            await onUpdateSetField(s.id, { memberWeights: draft });
                            setWeightsDraft((cur) => {
                              const next = { ...cur };
                              delete next[s.id];
                              return next;
                            });
                            toast.push({
                              title: t('assignments.setWeightsSaved'),
                              tone: 'success',
                            });
                          }}
                        >
                          {t('common.save')}
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
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
                  onChange={(e) =>
                    setNewSetRule(e.target.value as 'average' | 'highest' | 'weighted')
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="average">{t('grading.setRuleAverage')}</option>
                  <option value="highest">{t('grading.setRuleHighest')}</option>
                  <option value="weighted">{t('grading.setRuleWeighted')}</option>
                </select>
              </div>
              {newSetRule === 'weighted' ? (
                <SetWeightsEditor
                  members={quizList
                    .filter((q) => selectedIds.has(q.id))
                    .map((q) => ({ id: q.id, title: q.title }))}
                  weights={newSetWeights}
                  onChange={setNewSetWeights}
                />
              ) : null}
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

function ViewAttemptsButton({
  label,
  pending,
  total,
  onClick,
}: {
  label: string;
  pending: number;
  total: number;
  onClick: () => void;
}): JSX.Element {
  const tone = pending > 0 ? 'amber' : total > 0 ? 'emerald' : 'teal';
  const borderTone = {
    amber: 'border-amber-500/60 hover:bg-amber-500/10',
    emerald: 'border-emerald-500/50 hover:bg-emerald-500/10',
    teal: 'border-teal-500/40 hover:bg-teal-500/10',
  }[tone];
  const iconTone = {
    amber: 'text-amber-600 dark:text-amber-300',
    emerald: 'text-emerald-600 dark:text-emerald-300',
    teal: 'text-teal-500',
  }[tone];
  const dividerTone = {
    amber: 'border-amber-500/60',
    emerald: 'border-emerald-500/50',
    teal: 'border-teal-500/40',
  }[tone];
  const countTone = {
    amber: 'bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
    emerald: 'bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
    teal: 'bg-teal-500/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200',
  }[tone];

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-stretch overflow-hidden rounded-md border bg-background text-xs font-medium leading-none tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        borderTone,
      )}
    >
      <span className={cn('inline-flex items-center px-2', iconTone)}>
        <Inbox className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className={cn('inline-flex items-center border-l px-2', dividerTone, countTone)}>
        {pending}/{total}
      </span>
    </button>
  );
}
