import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  CalendarRange,
  CircleCheck,
  CircleOff,
  ClipboardList,
  ExternalLink,
  GripVertical,
  ListChecks,
  Lock,
  LockOpen,
  MessageSquare,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Dialog } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DownloadPresentationButton } from '@/components/presentation/DownloadPresentationButton';
import { cn } from '@/lib/utils';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { stripMarkdown } from '@/components/ui/markdown';
import { EmptyState } from '@/components/ui/empty';
import { ModuleContentSummary } from '@/components/ModuleContentSummary';
import { CourseHeader } from '@/components/course/CourseHeader';
import {
  useAlignModules,
  useAssignmentsList,
  useCourse,
  useCourseGradingSummary,
  useCreateModule,
  useDeleteModule,
  useDeleteMaterial,
  useDiscussionTopicsList,
  useMaterialsList,
  useModulesList,
  usePresentationsList,
  useQuizzesList,
  useReorderModules,
  useTransitionMaterial,
  useTransitionModule,
  useUpdateModule,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import { formatModuleWindow, moduleClosed } from '@/lib/moduleSchedule';
import type {
  AssignmentSummary,
  DiscussionTopicSummary,
  MaterialSummary,
  PresentationSummary,
  QuizSummary,
} from '@coursewise/shared';

/**
 * Sidebar card surfacing one pending-task counter. Body-only (no header
 * bar) with an icon + label on the left and an amber count badge on the
 * right. Caller is responsible for only rendering this when count > 0 —
 * the sidebar collapses zero-count tasks into a single "all caught up"
 * empty state instead of showing muted rows for each.
 */
function PendingTaskCard({
  to,
  icon: Icon,
  label,
  count,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  count: number;
}): JSX.Element {
  return (
    <Link
      to={to}
      className="block rounded-md border bg-card transition-colors hover:border-amber-400 hover:bg-amber-50/60 dark:hover:bg-amber-950/40"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{label}</p>
        </div>
        <span className="inline-flex min-w-[2rem] items-center justify-center rounded-md border border-amber-400/60 px-2 py-0.5 text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-300">
          {count}
        </span>
      </div>
    </Link>
  );
}

// Inner-card wrapper used by each per-module subsection (Materials,
// Presentations, Assignments, Quizzes, Discussions) so each lives in its
// own visual surface inside the expanded module accordion.
function Section({
  titleKey,
  children,
}: {
  titleKey: string;
  children: React.ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
          {t(titleKey)}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function TeacherModulesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const navigate = useNavigate();
  const course = useCourse(id);
  const list = useModulesList(id);
  const materialsQ = useMaterialsList(id);
  const presentationsQ = usePresentationsList(id);
  const assignmentsQ = useAssignmentsList(id);
  const quizzesQ = useQuizzesList(id);
  const gradingQ = useCourseGradingSummary(id);
  const discussionTopicsQ = useDiscussionTopicsList(id);
  const create = useCreateModule(id);
  const update = useUpdateModule(id);
  const del = useDeleteModule(id);
  const reorder = useReorderModules(id);
  const transitionMaterial = useTransitionMaterial(id);
  const transitionModule = useTransitionModule(id);
  const alignModules = useAlignModules(id);
  const delMaterial = useDeleteMaterial(id);
  const toast = useToast();
  const confirm = useConfirm();

  const [openCreate, setOpenCreate] = useState(false);
  const [alignConfirm, setAlignConfirm] = useState(false);
  // Controlled accordion state so the Expand all / Collapse all buttons can
  // bulk-set which module bodies are open.
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Drag-and-drop module reordering. We use the native HTML5 API (no extra
  // dependency) since modules are a flat list and a teacher's typical row
  // count is small. The mouse-drag mirrors the existing up/down arrows.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const moduleMaterials = useMemo(() => {
    const map = new Map<string, MaterialSummary[]>();
    for (const m of materialsQ.data ?? []) {
      if (!m.moduleId) continue;
      const arr = map.get(m.moduleId) ?? [];
      arr.push(m);
      map.set(m.moduleId, arr);
    }
    return map;
  }, [materialsQ.data]);

  const modulePresentations = useMemo(() => {
    const map = new Map<string, PresentationSummary[]>();
    for (const p of presentationsQ.data ?? []) {
      if (!p.moduleId) continue;
      const arr = map.get(p.moduleId) ?? [];
      arr.push(p);
      map.set(p.moduleId, arr);
    }
    return map;
  }, [presentationsQ.data]);

  const moduleAssignments = useMemo(() => {
    const map = new Map<string, AssignmentSummary[]>();
    for (const a of assignmentsQ.data ?? []) {
      if (!a.moduleId) continue;
      const arr = map.get(a.moduleId) ?? [];
      arr.push(a);
      map.set(a.moduleId, arr);
    }
    return map;
  }, [assignmentsQ.data]);

  const moduleQuizzes = useMemo(() => {
    const map = new Map<string, QuizSummary[]>();
    for (const q of quizzesQ.data ?? []) {
      if (!q.moduleId) continue;
      const arr = map.get(q.moduleId) ?? [];
      arr.push(q);
      map.set(q.moduleId, arr);
    }
    return map;
  }, [quizzesQ.data]);

  const moduleDiscussions = useMemo(() => {
    const map = new Map<string, DiscussionTopicSummary[]>();
    for (const d of discussionTopicsQ.data ?? []) {
      if (!d.moduleId) continue;
      const arr = map.get(d.moduleId) ?? [];
      arr.push(d);
      map.set(d.moduleId, arr);
    }
    return map;
  }, [discussionTopicsQ.data]);

  const onDropOnto = async (targetId: string) => {
    const fromIdx = list.data?.findIndex((m) => m.id === draggingId) ?? -1;
    const toIdx = list.data?.findIndex((m) => m.id === targetId) ?? -1;
    setDraggingId(null);
    setDragOverId(null);
    if (!list.data || fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const next = list.data.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    try {
      await reorder.mutateAsync({ ids: next.map((m) => m.id) });
      toast.push({ title: t('modules.reordered'), tone: 'success' });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      {course.data ? (
        <CourseHeader
          course={course.data}
          role="teacher"
          actions={
            <>
              {/* One toggle: "Collapse all" while anything is open, otherwise
                  "Expand all". Disabled when there are no modules to act on. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setOpenIds(openIds.length > 0 ? [] : (list.data ?? []).map((m) => m.id))
                }
                disabled={!list.data || list.data.length === 0}
              >
                {openIds.length > 0 ? t('modules.collapseAll') : t('modules.expandAll')}
              </Button>
              {course.data?.moduleCadence && course.data?.startDate ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAlignConfirm(true)}
                  disabled={!list.data || list.data.length === 0 || alignModules.isPending}
                >
                  <CalendarRange className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {t('modules.alignCta')}
                </Button>
              ) : null}
              <Button size="sm" onClick={() => setOpenCreate(true)}>
                {t('modules.newCta')}
              </Button>
            </>
          }
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState
          title={t('modules.empty')}
          action={<Button onClick={() => setOpenCreate(true)}>{t('modules.newCta')}</Button>}
        />
      ) : (
        <Accordion className="space-y-3" value={openIds} onValueChange={setOpenIds}>
          {list.data.map((m) => {
            const mats = moduleMaterials.get(m.id) ?? [];
            const pres = modulePresentations.get(m.id) ?? [];
            const asgs = moduleAssignments.get(m.id) ?? [];
            const qzs = moduleQuizzes.get(m.id) ?? [];
            const dscs = moduleDiscussions.get(m.id) ?? [];
            const isDragging = draggingId === m.id;
            const isDragOver = dragOverId === m.id && draggingId !== m.id;
            const closed = moduleClosed(m);
            const windowLabel = formatModuleWindow(m);
            return (
              <AccordionItem
                key={m.id}
                value={m.id}
                draggable
                onDragStart={(e) => {
                  setDraggingId(m.id);
                  e.dataTransfer.effectAllowed = 'move';
                  // setData required for Firefox to actually start the drag.
                  e.dataTransfer.setData('text/plain', m.id);
                }}
                onDragOver={(e) => {
                  if (!draggingId || draggingId === m.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverId !== m.id) setDragOverId(m.id);
                }}
                onDragLeave={(e) => {
                  // Only clear when leaving the item entirely, not when moving
                  // between child elements (which fire dragleave + dragenter).
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    if (dragOverId === m.id) setDragOverId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void onDropOnto(m.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                className={cn(
                  isDragging && 'opacity-50',
                  isDragOver && 'ring-2 ring-primary ring-offset-1',
                  // Past its window or manually closed: gray out the whole
                  // module — everything stays clickable, only the look changes.
                  closed && !isDragging && 'opacity-60 grayscale',
                )}
              >
                <AccordionTrigger
                  leading={
                    <span
                      className="hidden cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing md:inline-flex"
                      aria-label={t('common.drag')}
                      title={t('common.drag')}
                    >
                      <GripVertical className="h-4 w-4" aria-hidden />
                    </span>
                  }
                  trailing={
                    <>
                      {m.status === 'draft' ? (
                        <ActionIconButton
                          icon={CircleCheck}
                          label={t('modules.publish')}
                          color="emerald"
                          onClick={async () => {
                            try {
                              await transitionModule.mutateAsync({ id: m.id, action: 'publish' });
                              toast.push({ title: t('modules.published'), tone: 'success' });
                            } catch (err) {
                              const i18n =
                                err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                              toast.push({ title: t(i18n), tone: 'error' });
                            }
                          }}
                        />
                      ) : (
                        <ActionIconButton
                          icon={CircleOff}
                          label={t('modules.unpublish')}
                          color="orange"
                          onClick={async () => {
                            try {
                              await transitionModule.mutateAsync({ id: m.id, action: 'unpublish' });
                              toast.push({ title: t('modules.unpublished'), tone: 'success' });
                            } catch (err) {
                              const i18n =
                                err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                              toast.push({ title: t(i18n), tone: 'error' });
                            }
                          }}
                        />
                      )}
                      {m.closedAt ? (
                        <ActionIconButton
                          icon={LockOpen}
                          label={t('modules.reopen')}
                          color="teal"
                          onClick={async () => {
                            try {
                              await update.mutateAsync({ id: m.id, input: { closed: false } });
                              toast.push({ title: t('modules.reopened'), tone: 'success' });
                            } catch (err) {
                              const i18n =
                                err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                              toast.push({ title: t(i18n), tone: 'error' });
                            }
                          }}
                        />
                      ) : (
                        <ActionIconButton
                          icon={Lock}
                          label={t('modules.close')}
                          color="amber"
                          onClick={async () => {
                            try {
                              await update.mutateAsync({ id: m.id, input: { closed: true } });
                              toast.push({ title: t('modules.closedToast'), tone: 'success' });
                            } catch (err) {
                              const i18n =
                                err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                              toast.push({ title: t(i18n), tone: 'error' });
                            }
                          }}
                        />
                      )}
                      <ActionIconButton
                        icon={Pencil}
                        label={t('common.edit')}
                        color="yellow"
                        onClick={() => setEditingId(m.id)}
                      />
                      <ActionIconButton
                        icon={Trash2}
                        label={t('common.delete')}
                        color="red"
                        onClick={async () => {
                          const ok = await confirm({
                            title: t('modules.deleteTitle'),
                            description: t('modules.deleteBody'),
                            detail: { name: m.title },
                            confirmLabel: t('common.delete'),
                          });
                          if (!ok) return;
                          try {
                            await del.mutateAsync(m.id);
                            toast.push({ title: t('modules.deleted'), tone: 'success' });
                          } catch (err) {
                            const i18n =
                              err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                            toast.push({ title: t(i18n), tone: 'error' });
                          }
                        }}
                      />
                    </>
                  }
                >
                  <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{m.title}</span>
                      {m.status === 'draft' ? (
                        <Badge variant="outline" className="shrink-0 text-muted-foreground">
                          {t('modules.draftBadge')}
                        </Badge>
                      ) : null}
                      {closed ? (
                        <Badge variant="secondary" className="shrink-0">
                          {m.closedAt ? t('modules.closedBadge') : t('modules.endedBadge')}
                        </Badge>
                      ) : null}
                      {windowLabel ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                          {windowLabel}
                        </span>
                      ) : null}
                    </span>
                    <ModuleContentSummary
                      counts={{
                        materials: mats.length,
                        presentations: pres.length,
                        assignments: asgs.length,
                        quizzes: qzs.length,
                        discussions: dscs.length,
                      }}
                    />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {m.description ? (
                    <p className="text-sm text-muted-foreground">{stripMarkdown(m.description)}</p>
                  ) : null}

                  <Section titleKey="materials.title">
                    {mats.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('materials.emptyInModule')}
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {mats.map((mat) => (
                          <li
                            key={mat.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5"
                          >
                            <Link
                              to={`/teacher/courses/${id}/materials/${mat.id}`}
                              className="flex flex-1 items-center gap-2 rounded-sm hover:text-foreground"
                            >
                              <span className="text-sm font-medium hover:underline underline-offset-4">
                                {mat.title}
                              </span>
                              <Badge
                                variant={
                                  mat.status === 'published'
                                    ? 'success'
                                    : mat.status === 'draft'
                                      ? 'outline'
                                      : 'secondary'
                                }
                              >
                                {t(
                                  `materials.status${mat.status[0]!.toUpperCase()}${mat.status.slice(1)}`,
                                )}
                              </Badge>
                              <Badge variant="info">
                                {t(
                                  `materials.kind${mat.sourceType.replace(/(^|_)(\w)/g, (_, _b, c: string) => c.toUpperCase())}`,
                                )}
                              </Badge>
                            </Link>
                            <div className="flex items-center gap-1.5">
                              {mat.fileAssetId ? (
                                <DownloadPresentationButton
                                  fileAssetId={mat.fileAssetId}
                                  labelKey="common.download"
                                  iconOnly
                                />
                              ) : null}
                              <ActionIconButton
                                size="sm"
                                icon={mat.status === 'published' ? Archive : CircleCheck}
                                label={
                                  mat.status === 'published'
                                    ? t('materials.unpublish')
                                    : t('materials.publish')
                                }
                                color={mat.status === 'published' ? 'orange' : 'emerald'}
                                onClick={async () => {
                                  const action = mat.status === 'published' ? 'archive' : 'publish';
                                  try {
                                    await transitionMaterial.mutateAsync({ id: mat.id, action });
                                    toast.push({
                                      title: t(
                                        action === 'publish'
                                          ? 'materials.published'
                                          : 'materials.archived',
                                      ),
                                      tone: 'success',
                                    });
                                  } catch (err) {
                                    const i18n =
                                      err instanceof ApiClientError
                                        ? err.error.i18nKey
                                        : 'errors.internal';
                                    toast.push({ title: t(i18n), tone: 'error' });
                                  }
                                }}
                              />
                              <ActionIconButton
                                size="sm"
                                icon={Pencil}
                                label={t('common.edit')}
                                color="yellow"
                                onClick={() =>
                                  navigate(`/teacher/courses/${id}/materials/${mat.id}/edit`)
                                }
                              />
                              <ActionIconButton
                                size="sm"
                                icon={Trash2}
                                label={t('common.delete')}
                                color="red"
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: t('materials.deleteConfirmTitle'),
                                    description: t('materials.deleteConfirmBody'),
                                    detail: { name: mat.title },
                                    confirmLabel: t('materials.deleteConfirmAction'),
                                  });
                                  if (!ok) return;
                                  try {
                                    await delMaterial.mutateAsync(mat.id);
                                    toast.push({ title: t('materials.deleted'), tone: 'success' });
                                  } catch (err) {
                                    const i18n =
                                      err instanceof ApiClientError
                                        ? err.error.i18nKey
                                        : 'errors.internal';
                                    toast.push({ title: t(i18n), tone: 'error' });
                                  }
                                }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  {pres.length > 0 ? (
                    <Section titleKey="presentations.title">
                      <ul className="space-y-1.5">
                        {pres.map((p) => (
                          <li
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5"
                          >
                            <Link
                              to={`/teacher/courses/${id}/presentations/${p.id}`}
                              className="flex flex-1 items-center gap-2 rounded-sm hover:text-foreground"
                            >
                              <span className="text-sm font-medium underline-offset-4 hover:underline">
                                {p.title}
                              </span>
                              <Badge
                                variant={
                                  p.status === 'published'
                                    ? 'success'
                                    : p.status === 'draft'
                                      ? 'outline'
                                      : 'secondary'
                                }
                              >
                                {t(
                                  `presentations.status${p.status[0]!.toUpperCase()}${p.status.slice(1)}`,
                                )}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {t('presentations.slidesCount', { count: p.slideCount })}
                              </span>
                            </Link>
                            {p.provider === 'gamma' && p.externalUrl ? (
                              <a
                                href={p.externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={t('gamma.openInGamma')}
                                title={t('gamma.openInGamma')}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-transparent transition-colors hover:bg-accent"
                              >
                                <ExternalLink className="h-4 w-4" aria-hidden />
                              </a>
                            ) : null}
                            {p.fileAssetId ? (
                              <DownloadPresentationButton
                                fileAssetId={p.fileAssetId}
                                iconOnly
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  ) : null}

                  {asgs.length > 0 ? (
                    <Section titleKey="assignments.title">
                      <ul className="space-y-1.5">
                        {asgs.map((a) => (
                          <li
                            key={a.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5"
                          >
                            <Link
                              to={`/teacher/courses/${id}/assignments/${a.id}`}
                              className="flex flex-1 items-center gap-2 rounded-sm hover:text-foreground"
                            >
                              <span className="text-sm font-medium underline-offset-4 hover:underline">
                                {a.title}
                              </span>
                              <Badge
                                variant={
                                  a.status === 'published'
                                    ? 'success'
                                    : a.status === 'draft'
                                      ? 'outline'
                                      : 'secondary'
                                }
                              >
                                {t(
                                  `assignments.status${a.status[0]!.toUpperCase()}${a.status.slice(1)}`,
                                )}
                              </Badge>
                              {a.dueDate ? (
                                <span className="text-xs text-muted-foreground">
                                  {t('assignments.dueLabel')}:{' '}
                                  {new Date(a.dueDate).toLocaleDateString()}
                                </span>
                              ) : null}
                            </Link>
                            {a.attachmentFileId ? (
                              <DownloadPresentationButton
                                fileAssetId={a.attachmentFileId}
                                labelKey="common.download"
                                iconOnly
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  ) : null}

                  {qzs.length > 0 ? (
                    <Section titleKey="quizzes.title">
                      <ul className="space-y-1.5">
                        {qzs.map((q) => (
                          <li
                            key={q.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5"
                          >
                            <Link
                              to={`/teacher/courses/${id}/quizzes/${q.id}`}
                              className="flex flex-1 items-center gap-2 rounded-sm hover:text-foreground"
                            >
                              <span className="text-sm font-medium underline-offset-4 hover:underline">
                                {q.title}
                              </span>
                              <Badge
                                variant={
                                  q.status === 'published'
                                    ? 'success'
                                    : q.status === 'draft'
                                      ? 'outline'
                                      : 'secondary'
                                }
                              >
                                {t(
                                  `quizzes.status${q.status[0]!.toUpperCase()}${q.status.slice(1)}`,
                                )}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {t('quizzes.questionsCount', { count: q.questionCount ?? 0 })}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  ) : null}

                  {dscs.length > 0 ? (
                    <Section titleKey="discussion.title">
                      <ul className="space-y-1.5">
                        {dscs.map((d) => (
                          <li
                            key={d.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5"
                          >
                            <Link
                              to={`/teacher/courses/${id}/discussion/${d.id}`}
                              className="flex flex-1 items-center gap-2 rounded-sm hover:text-foreground"
                            >
                              <span className="text-sm font-medium underline-offset-4 hover:underline">
                                {d.title}
                              </span>
                              <Badge
                                variant={
                                  d.status === 'published'
                                    ? 'success'
                                    : d.status === 'draft'
                                      ? 'outline'
                                      : 'secondary'
                                }
                              >
                                {t(
                                  `discussion.status${d.status[0]!.toUpperCase()}${d.status.slice(1)}`,
                                )}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {t('discussion.postCount', { count: d.postCount ?? 0 })}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
        </div>

        <aside className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('modules.pendingTasksTitle')}
          </h3>
          {(() => {
            if (gradingQ.isLoading) {
              return (
                <p className="rounded-md border bg-card px-3 py-2.5 text-sm text-muted-foreground">
                  {t('common.loading')}
                </p>
              );
            }
            // One row per gradable item with an ungraded backlog, ordered
            // assignments → quizzes → discussions. Each per-item array is
            // already sorted by backlog size by the API, and each row links
            // straight to that item's grading page. When everything is graded
            // the list is empty and we surface a single "All caught up" card.
            const data = gradingQ.data;
            const tasks: Array<{
              key: string;
              to: string;
              icon: LucideIcon;
              label: string;
              count: number;
            }> = [
              ...(data?.assignmentTasks ?? []).map((task) => ({
                key: `assignment-${task.id}`,
                to: `/teacher/courses/${id}/assignments/${task.id}/submissions`,
                icon: ClipboardList,
                label: task.title,
                count: task.count,
              })),
              ...(data?.quizTasks ?? []).map((task) => ({
                key: `quiz-${task.id}`,
                to: `/teacher/courses/${id}/quizzes/${task.id}/attempts`,
                icon: ListChecks,
                label: task.title,
                count: task.count,
              })),
              ...(data?.discussionTasks ?? []).map((task) => ({
                key: `discussion-${task.id}`,
                to: `/teacher/courses/${id}/discussion/${task.id}`,
                icon: MessageSquare,
                label: task.title,
                count: task.count,
              })),
            ];
            if (tasks.length === 0) {
              return (
                <div className="flex items-center gap-3 rounded-md border border-emerald-500/40 bg-emerald-50/40 px-3 py-2.5 dark:bg-emerald-950/30">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                    <CircleCheck className="h-4 w-4" aria-hidden />
                  </span>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    {t('course.overview.needsGradingAllClear')}
                  </p>
                </div>
              );
            }
            return tasks.map((task) => (
              <PendingTaskCard
                key={task.key}
                to={task.to}
                icon={task.icon}
                label={task.label}
                count={task.count}
              />
            ));
          })()}
        </aside>
      </div>

      {/* Align-to-schedule confirm: it overwrites every module's window. */}
      <Dialog
        open={alignConfirm}
        onClose={() => setAlignConfirm(false)}
        title={t('modules.alignConfirmTitle')}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('modules.alignConfirmBody')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAlignConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={alignModules.isPending}
              onClick={async () => {
                try {
                  await alignModules.mutateAsync();
                  setAlignConfirm(false);
                  toast.push({ title: t('modules.aligned'), tone: 'success' });
                } catch (err) {
                  const i18n =
                    err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                  toast.push({ title: t(i18n), tone: 'error' });
                }
              }}
            >
              {t('modules.alignCta')}
            </Button>
          </div>
        </div>
      </Dialog>

      <ModuleDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSubmit={async (input) => {
          try {
            await create.mutateAsync(input);
            toast.push({ title: t('modules.created'), tone: 'success' });
            setOpenCreate(false);
          } catch (err) {
            const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
            toast.push({ title: t(i18n), tone: 'error' });
          }
        }}
      />

      {editingId ? (
        <ModuleDialog
          open
          onClose={() => setEditingId(null)}
          initial={list.data?.find((m) => m.id === editingId) ?? null}
          onSubmit={async (input) => {
            try {
              await update.mutateAsync({ id: editingId, input });
              toast.push({ title: t('modules.updated'), tone: 'success' });
              setEditingId(null);
            } catch (err) {
              const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
              toast.push({ title: t(i18n), tone: 'error' });
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ModuleDialog({
  open,
  onClose,
  onSubmit,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    description: string | null;
    startAt?: string | null;
    endAt?: string | null;
  }) => Promise<void>;
  initial?: {
    title: string;
    description: string | null;
    startAt?: string | null;
    endAt?: string | null;
  } | null;
}): JSX.Element {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  // <input type="datetime-local"> wants YYYY-MM-DDTHH:MM; windows are stored
  // as UTC wall-clock ISO, so slicing keeps the times the teacher entered.
  const [startAt, setStartAt] = useState(initial?.startAt ? initial.startAt.slice(0, 16) : '');
  const [endAt, setEndAt] = useState(initial?.endAt ? initial.endAt.slice(0, 16) : '');
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('common.edit') : t('modules.newCta')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const input: {
            title: string;
            description: string | null;
            startAt?: string | null;
            endAt?: string | null;
          } = { title, description: description || null };
          // On create, omitting the window lets the server auto-assign the
          // next slot from the course schedule; on edit, send explicit values
          // (null clears).
          if (initial || startAt) input.startAt = startAt ? `${startAt}:00.000Z` : null;
          if (initial || endAt) input.endAt = endAt ? `${endAt}:00.000Z` : null;
          await onSubmit(input);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="title">{t('modules.titleLabel')}</Label>
          <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="mod-start">{t('modules.startLabel')}</Label>
            <Input
              id="mod-start"
              type="datetime-local"
              value={startAt}
              max={endAt || undefined}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mod-end">{t('modules.endLabel')}</Label>
            <Input
              id="mod-end"
              type="datetime-local"
              value={endAt}
              min={startAt || undefined}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="description">{t('modules.descriptionLabel')}</Label>
          <MarkdownEditor id="description" value={description} onChange={setDescription} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit">{t('common.save')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
