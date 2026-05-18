import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import { Input, Label, Textarea } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { stripMarkdown } from '@/components/ui/markdown';
import { EmptyState } from '@/components/ui/empty';
import {
  useCreateModule,
  useDeleteModule,
  useDeleteMaterial,
  useMaterialsList,
  useModulesList,
  useReorderModules,
  useTransitionMaterial,
  useUpdateModule,
  useUpdateMaterial,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import type {
  MaterialSummary,
  ModuleSummary,
  UpdateMaterialInput,
} from '@coursewise/shared';

export function TeacherModulesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useModulesList(id);
  const materialsQ = useMaterialsList(id);
  const create = useCreateModule(id);
  const update = useUpdateModule(id);
  const del = useDeleteModule(id);
  const reorder = useReorderModules(id);
  const transitionMaterial = useTransitionMaterial(id);
  const updateMaterial = useUpdateMaterial(id);
  const delMaterial = useDeleteMaterial(id);
  const toast = useToast();

  const [openCreate, setOpenCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<MaterialSummary | null>(null);

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
                            const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
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
                      <p className="text-sm text-muted-foreground">{t('materials.emptyInModule')}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {mats.map((mat) => (
                          <li
                            key={mat.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5"
                          >
                            <div className="flex flex-1 items-center gap-2">
                              <span className="text-sm font-medium">{mat.title}</span>
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
                            </div>
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
                                      err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                                    toast.push({ title: t(i18n), tone: 'error' });
                                  }
                                }}
                              />
                              <ActionIconButton
                                size="sm"
                                icon={Pencil}
                                label={t('common.edit')}
                                color="yellow"
                                onClick={() => setEditingMaterial(mat)}
                              />
                              <ActionIconButton
                                size="sm"
                                icon={Trash2}
                                label={t('common.delete')}
                                color="red"
                                onClick={async () => {
                                  if (!window.confirm(`${t('common.delete')}: ${mat.title}?`)) return;
                                  try {
                                    await delMaterial.mutateAsync(mat.id);
                                    toast.push({ title: t('materials.deleted'), tone: 'success' });
                                  } catch (err) {
                                    const i18n =
                                      err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
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

      {editingMaterial ? (
        <ModuleMaterialEditDialog
          material={editingMaterial}
          modules={list.data ?? []}
          courseId={id}
          onClose={() => setEditingMaterial(null)}
          onSubmit={async (input) => {
            try {
              await updateMaterial.mutateAsync({ id: editingMaterial.id, input });
              toast.push({ title: t('materials.updated'), tone: 'success' });
              setEditingMaterial(null);
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

function ModuleMaterialEditDialog({
  material,
  modules,
  onClose,
  onSubmit,
}: {
  material: MaterialSummary;
  modules: ModuleSummary[];
  courseId: string;
  onClose: () => void;
  onSubmit: (input: UpdateMaterialInput) => Promise<void>;
}): JSX.Element {
  // Lightweight reuse of the same fields as the standalone edit dialog — only
  // text-based source types are supported inline here. For replacing an
  // uploaded file, the teacher uses the Materials page edit dialog which has
  // the upload widget. (Keeping these decoupled avoids two copies of the same
  // upload XHR state.)
  const { t } = useTranslation();
  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description ?? '');
  const [moduleId, setModuleId] = useState(material.moduleId ?? '');
  const [content, setContent] = useState(material.content ?? '');
  const [externalUrl, setExternalUrl] = useState(material.externalUrl ?? '');

  return (
    <Dialog open onClose={onClose} title={t('materials.editTitle')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const input: UpdateMaterialInput = {
            title,
            description: description.trim() ? description : null,
            moduleId: moduleId || null,
          };
          if (material.sourceType === 'manual_text') input.content = content;
          if (material.sourceType === 'external_link') input.externalUrl = externalUrl;
          await onSubmit(input);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="mm-title">{t('materials.titleLabel')}</Label>
          <Input id="mm-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mm-desc">{t('materials.descriptionLabel')}</Label>
          <Textarea
            id="mm-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mm-module">{t('materials.module')}</Label>
          <select
            id="mm-module"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
          >
            <option value="">{t('common.none')}</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
        {material.sourceType === 'external_link' ? (
          <div className="space-y-1">
            <Label htmlFor="mm-url">{t('materials.externalUrl')}</Label>
            <Input
              id="mm-url"
              type="url"
              required
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
            />
          </div>
        ) : null}
        {material.sourceType === 'manual_text' ? (
          <div className="space-y-1">
            <Label htmlFor="mm-content">{t('materials.content')}</Label>
            <MarkdownEditor id="mm-content" required value={content} onChange={setContent} />
          </div>
        ) : null}
        {material.sourceType === 'upload' ? (
          <p className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
            {t('materials.uploadEditHint')}
          </p>
        ) : null}
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
