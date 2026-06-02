import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  Circle,
  CircleCheck,
  FolderInput,
  Inbox,
  Layers,
  Lock,
  RefreshCw,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { stripMarkdown } from '@/components/ui/markdown';
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
  useAssignmentSets,
  useAssignmentsList,
  useCreateAssignmentSet,
  useDeleteAssignment,
  useDeleteAssignmentSet,
  useModulesList,
  useTransitionAssignment,
  useUpdateAssignment,
  useUpdateAssignmentSet,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AssignmentSummary } from '@coursewise/shared';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatusIcon({ status }: { status: AssignmentSummary['status'] }): JSX.Element {
  const { t } = useTranslation();
  const label = t(`assignments.status${status[0]!.toUpperCase()}${status.slice(1)}`);
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
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-transparent ${tone}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

export function TeacherAssignmentsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const navigate = useNavigate();
  const list = useAssignmentsList(id);
  const transition = useTransitionAssignment(id);
  const del = useDeleteAssignment(id);
  const update = useUpdateAssignment(id);
  const modulesQ = useModulesList(id || null);
  const groupsQ = useAssignmentGroups(id || undefined);
  const setsQ = useAssignmentSets(id || undefined);
  const createSet = useCreateAssignmentSet(id);
  const updateSet = useUpdateAssignmentSet(id);
  const deleteSet = useDeleteAssignmentSet(id);
  const toast = useToast();

  const [deleteTarget, setDeleteTarget] = useState<AssignmentSummary | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<
    { assignment: AssignmentSummary; action: 'archive' | 'unarchive' } | null
  >(null);
  const [moveTarget, setMoveTarget] = useState<AssignmentSummary | null>(null);
  const [moveModuleId, setMoveModuleId] = useState<string>('');
  const [search, setSearch] = useState('');

  // Multi-select → assignment-set assignment.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [setMode, setSetMode] = useState<'new' | 'existing'>('new');
  const [newSetName, setNewSetName] = useState('');
  const [newSetCategory, setNewSetCategory] = useState('');
  const [newSetRule, setNewSetRule] = useState<'average' | 'highest'>('average');
  const [existingSetId, setExistingSetId] = useState('');

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));
  const setById = new Map((setsQ.data ?? []).map((s) => [s.id, s]));
  const groupList = groupsQ.data ?? [];
  const setList = setsQ.data ?? [];

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list.data ?? [];
    return (list.data ?? []).filter((a) => {
      if (a.title.toLowerCase().includes(q)) return true;
      const moduleTitle = a.moduleId ? moduleTitleById.get(a.moduleId) : undefined;
      return moduleTitle ? moduleTitle.toLowerCase().includes(q) : false;
    });
    // moduleTitleById is rebuilt every render from modulesQ.data, so depend on
    // the underlying data rather than the Map identity.
  }, [search, list.data, modulesQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const allVisibleSelected =
    filteredAssignments.length > 0 && filteredAssignments.every((a) => selectedIds.has(a.id));

  function toggleRow(aid: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(aid)) next.delete(aid);
      else next.add(aid);
      return next;
    });
  }

  function toggleAll(): void {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredAssignments.map((a) => a.id)));
  }

  async function onGroupIntoSet(): Promise<void> {
    try {
      let targetSetId = existingSetId;
      if (setMode === 'new') {
        if (!newSetName.trim()) {
          toast.push({ title: t('assignments.setNameRequired'), tone: 'error' });
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
        toast.push({ title: t('assignments.setPickRequired'), tone: 'error' });
        return;
      }
      await Promise.all(
        [...selectedIds].map((aid) => update.mutateAsync({ id: aid, input: { setId: targetSetId } })),
      );
      toast.push({ title: t('assignments.setAssigned'), tone: 'success' });
      setGroupDialogOpen(false);
      setSelectedIds(new Set());
      setNewSetName('');
      setNewSetCategory('');
      setNewSetRule('average');
      setExistingSetId('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  }

  async function onRemoveFromSet(aid: string): Promise<void> {
    try {
      await update.mutateAsync({ id: aid, input: { setId: null } });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  }

  async function onUpdateSetField(
    setId: string,
    patch: { name?: string; groupId?: string | null; scoringRule?: 'average' | 'highest' },
  ): Promise<void> {
    try {
      await updateSet.mutateAsync({ setId, ...patch });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  }

  async function onDeleteSet(setId: string, name: string): Promise<void> {
    // eslint-disable-next-line no-alert
    if (!confirm(t('assignments.setDeleteConfirm', { name }))) return;
    try {
      await deleteSet.mutateAsync(setId);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('assignments.title')}</h2>
      </header>

      <div className="overflow-hidden rounded-md border">
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-3 py-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('assignments.searchPlaceholder')}
            className="h-8 w-56"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={selectedIds.size === 0}
            onClick={() => setGroupDialogOpen(true)}
          >
            <Layers className="h-4 w-4" aria-hidden />
            {t('assignments.groupIntoSet', { count: selectedIds.size })}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setManageOpen(true)}>
            {t('assignments.manageSets')}
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/teacher/courses/${id}/assignments/new`}>{t('assignments.newCta')}</Link>
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
          </div>
        </div>
        {list.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('assignments.empty')}</p>
        ) : filteredAssignments.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t('assignments.noMatches')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label={t('assignments.selectAll')}
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer align-middle"
                  />
                </TableHead>
                <TableHead>{t('assignments.colTitle')}</TableHead>
                <TableHead>{t('assignments.colSet')}</TableHead>
                <TableHead>{t('assignments.colDescription')}</TableHead>
                <TableHead>{t('assignments.colModule')}</TableHead>
                <TableHead>{t('assignments.colDue')}</TableHead>
                <TableHead className="text-right">{t('assignments.colMaxScore')}</TableHead>
                <TableHead className="text-right">{t('assignments.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssignments.map((a) => (
                <TableRow key={a.id} data-state={selectedIds.has(a.id) ? 'selected' : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={t('assignments.selectRow', { title: a.title })}
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleRow(a.id)}
                      className="h-4 w-4 cursor-pointer align-middle"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={a.status} />
                      <Link
                        to={`/teacher/courses/${id}/assignments/${a.id}`}
                        className="hover:underline"
                      >
                        {a.title}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.setId && setById.get(a.setId) ? (
                      <Badge variant="secondary" className="gap-1">
                        <Layers className="h-3 w-3" aria-hidden />
                        {setById.get(a.setId)!.name}
                        <button
                          type="button"
                          aria-label={t('assignments.removeFromSet')}
                          title={t('assignments.removeFromSet')}
                          onClick={() => void onRemoveFromSet(a.id)}
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
                    <span className="line-clamp-1">
                      {a.description ? stripMarkdown(a.description) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-between gap-2">
                      <span className={a.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                        {a.moduleId ? (moduleTitleById.get(a.moduleId) ?? '—') : '—'}
                      </span>
                      <ActionIconButton
                        icon={FolderInput}
                        label={t('assignments.linkModuleAction')}
                        color="sky"
                        className="shrink-0"
                        onClick={() => {
                          setMoveModuleId(a.moduleId ?? '');
                          setMoveTarget(a);
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(a.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.maxScore ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <ActionIconButton
                        icon={SquarePen}
                        label={t('common.edit')}
                        color="yellow"
                        onClick={() => navigate(`/teacher/courses/${id}/assignments/${a.id}`)}
                      />
                      <ViewSubmissionsButton
                        label={
                          (a.ungradedSubmissionCount ?? 0) > 0
                            ? t('assignments.viewSubmissionsActionWithUngraded', {
                                count: a.submissionCount ?? 0,
                                ungraded: a.ungradedSubmissionCount ?? 0,
                              })
                            : t('assignments.viewSubmissionsAction', {
                                count: a.submissionCount ?? 0,
                              })
                        }
                        ungraded={a.ungradedSubmissionCount ?? 0}
                        total={a.submissionCount ?? 0}
                        onClick={() =>
                          navigate(`/teacher/courses/${id}/assignments/${a.id}/submissions`)
                        }
                      />
                      {a.status === 'draft' ? (
                        <ActionIconButton
                          icon={CircleCheck}
                          label={t('assignments.publish')}
                          color="emerald"
                          onClick={async () => {
                            try {
                              await transition.mutateAsync({ id: a.id, action: 'publish' });
                              toast.push({
                                title: t('assignments.published'),
                                tone: 'success',
                              });
                            } catch {
                              toast.push({
                                title: t('assignments.publishBlocked'),
                                tone: 'error',
                              });
                            }
                          }}
                        />
                      ) : null}
                      {a.status === 'published' ? (
                        <ActionIconButton
                          icon={Lock}
                          label={t('assignments.close')}
                          color="sky"
                          onClick={async () => {
                            await transition.mutateAsync({ id: a.id, action: 'close' });
                          }}
                        />
                      ) : null}
                      {a.status !== 'archived' ? (
                        <ActionIconButton
                          icon={Archive}
                          label={t('assignments.archive')}
                          color="orange"
                          onClick={() => setArchiveTarget({ assignment: a, action: 'archive' })}
                        />
                      ) : (
                        <ActionIconButton
                          icon={ArchiveRestore}
                          label={t('assignments.unarchive')}
                          color="emerald"
                          onClick={() => setArchiveTarget({ assignment: a, action: 'unarchive' })}
                        />
                      )}
                      <ActionIconButton
                        icon={Trash2}
                        label={t('common.delete')}
                        color="red"
                        onClick={() => setDeleteTarget(a)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('assignments.deleteDialogTitle')}
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">{t('assignments.deleteConfirm')}</p>
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
                toast.push({ title: t('assignments.deleted'), tone: 'success' });
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
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        title={
          archiveTarget?.action === 'unarchive'
            ? t('assignments.unarchiveDialogTitle')
            : t('assignments.archiveDialogTitle')
        }
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">
          {archiveTarget?.action === 'unarchive'
            ? t('assignments.unarchiveConfirm')
            : t('assignments.archiveConfirm')}
        </p>
        {archiveTarget ? (
          <p className="mt-2 text-sm font-medium">{archiveTarget.assignment.title}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setArchiveTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={transition.isPending}
            onClick={async () => {
              if (!archiveTarget) return;
              try {
                await transition.mutateAsync({
                  id: archiveTarget.assignment.id,
                  action: archiveTarget.action,
                });
                setArchiveTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {archiveTarget?.action === 'unarchive'
              ? t('assignments.unarchive')
              : t('assignments.archive')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        title={t('assignments.linkModuleTitle')}
        dismissOnBackdropClick={false}
      >
        <div className="space-y-2">
          <Label htmlFor="move-module">{t('assignments.moduleLabel')}</Label>
          <select
            id="move-module"
            value={moveModuleId}
            onChange={(e) => setMoveModuleId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={modulesQ.isLoading}
          >
            <option value="">{t('assignments.unassignedModule')}</option>
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
                toast.push({ title: t('assignments.moduleUpdated'), tone: 'success' });
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
        open={groupDialogOpen}
        onClose={() => setGroupDialogOpen(false)}
        title={t('assignments.setDialogTitle', { count: selectedIds.size })}
        dismissOnBackdropClick={false}
      >
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="set-mode"
                checked={setMode === 'new'}
                onChange={() => setSetMode('new')}
              />
              {t('assignments.setModeNew')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="set-mode"
                checked={setMode === 'existing'}
                onChange={() => setSetMode('existing')}
                disabled={setList.length === 0}
              />
              {t('assignments.setModeExisting')}
            </label>
          </div>

          {setMode === 'new' ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="set-name">{t('assignments.setName')}</Label>
                <Input
                  id="set-name"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder={t('assignments.setNamePlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="set-category">{t('assignments.setCategory')}</Label>
                <select
                  id="set-category"
                  value={newSetCategory}
                  onChange={(e) => setNewSetCategory(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{t('assignments.setNoCategory')}</option>
                  {groupList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="set-rule">{t('assignments.setRule')}</Label>
                <select
                  id="set-rule"
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
              <Label htmlFor="set-existing">{t('assignments.setExisting')}</Label>
              <select
                id="set-existing"
                value={existingSetId}
                onChange={(e) => setExistingSetId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('assignments.setPickPlaceholder')}</option>
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
            {t('assignments.setAssignCta')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title={t('assignments.manageSetsTitle')}
        className="max-w-3xl"
      >
        <p className="text-sm text-muted-foreground">{t('assignments.manageSetsHint')}</p>
        {setList.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('assignments.setsEmpty')}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {setList.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <Input
                  defaultValue={s.name}
                  aria-label={t('assignments.setName')}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== s.name) void onUpdateSetField(s.id, { name: next });
                  }}
                  className="min-w-0 flex-1"
                />
                <select
                  aria-label={t('assignments.setCategory')}
                  className="h-10 w-32 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                  value={s.groupId ?? ''}
                  onChange={(e) => void onUpdateSetField(s.id, { groupId: e.target.value || null })}
                >
                  <option value="">{t('assignments.setNoCategory')}</option>
                  {groupList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('assignments.setRule')}
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
                  {t('assignments.setMembers', { count: s.memberCount ?? 0 })}
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
    </div>
  );
}

/**
 * Compound view-submissions button: rounded-outline pill that bundles the
 * Inbox icon with an x/y count badge into one clickable affordance. Color
 * theme flips based on workload — amber when there's ungraded work, emerald
 * when caught up, muted teal when nothing has been submitted yet.
 */
function ViewSubmissionsButton({
  label,
  ungraded,
  total,
  onClick,
}: {
  label: string;
  ungraded: number;
  total: number;
  onClick: () => void;
}): JSX.Element {
  const tone =
    ungraded > 0 ? 'amber' : total > 0 ? 'emerald' : 'teal';
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
    emerald:
      'bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
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
      <span
        className={cn('inline-flex items-center border-l px-2', dividerTone, countTone)}
      >
        {ungraded}/{total}
      </span>
    </button>
  );
}
