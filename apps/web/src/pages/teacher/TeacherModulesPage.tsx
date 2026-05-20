import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, ChevronDown, ChevronUp, CircleCheck, Pencil, Trash2 } from 'lucide-react';
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
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { stripMarkdown } from '@/components/ui/markdown';
import { EmptyState } from '@/components/ui/empty';
import {
  useAssignmentsList,
  useCreateModule,
  useDeleteModule,
  useDeleteMaterial,
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
  MaterialSummary,
  PresentationSummary,
  QuizSummary,
} from '@coursewise/shared';

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
  const create = useCreateModule(id);
  const update = useUpdateModule(id);
  const del = useDeleteModule(id);
  const reorder = useReorderModules(id);
  const transitionMaterial = useTransitionMaterial(id);
  const delMaterial = useDeleteMaterial(id);
  const toast = useToast();

  const [openCreate, setOpenCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const onMove = async (index: number, dir: -1 | 1) => {
    if (!list.data) return;
    const next = list.data.slice();
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
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
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('modules.title')}</h2>
        <Button onClick={() => setOpenCreate(true)}>{t('modules.newCta')}</Button>
      </header>
      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState
          title={t('modules.empty')}
          action={<Button onClick={() => setOpenCreate(true)}>{t('modules.newCta')}</Button>}
        />
      ) : (
        <Accordion className="space-y-3">
          {list.data.map((m, idx) => {
            const mats = moduleMaterials.get(m.id) ?? [];
            const pres = modulePresentations.get(m.id) ?? [];
            const asgs = moduleAssignments.get(m.id) ?? [];
            const qzs = moduleQuizzes.get(m.id) ?? [];
            return (
              <AccordionItem key={m.id} value={m.id}>
                <AccordionTrigger
                  trailing={
                    <>
                      <ActionIconButton
                        icon={ChevronUp}
                        label={t('common.moveUp')}
                        color="sky"
                        onClick={() => onMove(idx, -1)}
                        disabled={idx === 0}
                      />
                      <ActionIconButton
                        icon={ChevronDown}
                        label={t('common.moveDown')}
                        color="sky"
                        onClick={() => onMove(idx, 1)}
                        disabled={idx === list.data!.length - 1}
                      />
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('materials.countInModule', { count: mats.length })}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {m.description ? (
                    <p className="text-sm text-muted-foreground">{stripMarkdown(m.description)}</p>
                  ) : null}

                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('materials.title')}
                    </div>
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
                  </div>

                  {pres.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('presentations.title')}
                      </div>
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
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {asgs.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('assignments.title')}
                      </div>
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
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {qzs.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('quizzes.title')}
                      </div>
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
                    </div>
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
