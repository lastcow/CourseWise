import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, CircleCheck, ExternalLink, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DownloadPresentationButton } from '@/components/presentation/DownloadPresentationButton';
import { cn } from '@/lib/utils';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { stripMarkdown } from '@/components/ui/markdown';
import { EmptyState } from '@/components/ui/empty';
import { ModuleContentSummary } from '@/components/ModuleContentSummary';
import {
  useAssignmentsList,
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
  useUpdateModule,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import type {
  AssignmentSummary,
  DiscussionTopicSummary,
  MaterialSummary,
  PresentationSummary,
  QuizSummary,
} from '@coursewise/shared';

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
  const list = useModulesList(id);
  const materialsQ = useMaterialsList(id);
  const presentationsQ = usePresentationsList(id);
  const assignmentsQ = useAssignmentsList(id);
  const quizzesQ = useQuizzesList(id);
  const discussionTopicsQ = useDiscussionTopicsList(id);
  const create = useCreateModule(id);
  const update = useUpdateModule(id);
  const del = useDeleteModule(id);
  const reorder = useReorderModules(id);
  const transitionMaterial = useTransitionMaterial(id);
  const delMaterial = useDeleteMaterial(id);
  const toast = useToast();

  const [openCreate, setOpenCreate] = useState(false);
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
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('modules.title')}</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenIds((list.data ?? []).map((m) => m.id))}
            disabled={!list.data || list.data.length === 0}
          >
            {t('modules.expandAll')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenIds([])}
            disabled={openIds.length === 0}
          >
            {t('modules.collapseAll')}
          </Button>
          <Button onClick={() => setOpenCreate(true)}>{t('modules.newCta')}</Button>
        </div>
      </header>
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
                          if (!window.confirm(`${t('common.delete')}: ${m.title}?`)) return;
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
                    <span className="font-medium">{m.title}</span>
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
                                  if (!window.confirm(`${t('common.delete')}: ${mat.title}?`))
                                    return;
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
  onSubmit: (input: { title: string; description: string | null }) => Promise<void>;
  initial?: { title: string; description: string | null } | null;
}): JSX.Element {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('common.edit') : t('modules.newCta')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({ title, description: description || null });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="title">{t('modules.titleLabel')}</Label>
          <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
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
