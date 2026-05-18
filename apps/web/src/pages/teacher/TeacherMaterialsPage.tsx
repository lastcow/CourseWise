import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { EmptyState } from '@/components/ui/empty';
import {
  uploadFile,
  useCreateMaterial,
  useDeleteMaterial,
  useMaterialsList,
  useModulesList,
  useTransitionMaterial,
  useUpdateMaterial,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  type MaterialSourceType,
  type MaterialSummary,
  type ModuleSummary,
  type UpdateMaterialInput,
} from '@coursewise/shared';

// Layout choice: a single unified Materials page that visually groups materials
// by their linked module, with an "Unassigned" group at the bottom for
// orphans. Publish / unpublish / edit / delete actions live on each material
// row inside its module section — there is no separate top-level list of
// module-linked materials, so nothing is duplicated.

export function TeacherMaterialsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const materialsQ = useMaterialsList(id);
  const modulesQ = useModulesList(id);
  const create = useCreateMaterial(id);
  const update = useUpdateMaterial(id);
  const transition = useTransitionMaterial(id);
  const del = useDeleteMaterial(id);
  const toast = useToast();
  const [showCreate, setShowCreate] = useState<Exclude<MaterialSourceType, 'upload'> | null>(null);
  const [editing, setEditing] = useState<MaterialSummary | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => groupByModule(materialsQ.data ?? [], modulesQ.data ?? []), [
    materialsQ.data,
    modulesQ.data,
  ]);

  const onUpload: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
      toast.push({ title: t('files.invalidType'), tone: 'error' });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.push({ title: t('files.tooLarge'), tone: 'error' });
      return;
    }
    try {
      setUploadProgress(0);
      const { fileAssetId } = await uploadFile(file, id, 'material', setUploadProgress);
      await create.mutateAsync({
        title: file.name,
        sourceType: 'upload',
        fileAssetId,
      });
      toast.push({ title: t('materials.uploadComplete'), tone: 'success' });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t('materials.uploadFailed'), description: t(i18n), tone: 'error' });
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderRow = (m: MaterialSummary) => (
    <MaterialRow
      key={m.id}
      material={m}
      onPublishToggle={async () => {
        try {
          const action = m.status === 'published' ? 'archive' : 'publish';
          await transition.mutateAsync({ id: m.id, action });
          toast.push({
            title: t(action === 'publish' ? 'materials.published' : 'materials.archived'),
            tone: 'success',
          });
        } catch (err) {
          const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
          toast.push({ title: t(i18n), tone: 'error' });
        }
      }}
      onEdit={() => setEditing(m)}
      onDelete={async () => {
        if (!window.confirm(`${t('common.delete')}: ${m.title}?`)) return;
        try {
          await del.mutateAsync(m.id);
          toast.push({ title: t('materials.deleted'), tone: 'success' });
        } catch (err) {
          const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
          toast.push({ title: t(i18n), tone: 'error' });
        }
      }}
    />
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('materials.title')}</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <label>
              {t('materials.uploadCta')}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ALLOWED_UPLOAD_MIME_TYPES.join(',')}
                onChange={onUpload}
              />
            </label>
          </Button>
          <Button onClick={() => setShowCreate('external_link')}>{t('materials.linkCta')}</Button>
          <Button onClick={() => setShowCreate('manual_text')}>{t('materials.textCta')}</Button>
        </div>
      </header>

      {uploadProgress !== null ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          {t('materials.uploading', { progress: uploadProgress })}
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      ) : null}

      {materialsQ.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : grouped.totalMaterials === 0 ? (
        <EmptyState title={t('materials.empty')} />
      ) : (
        <div className="space-y-6">
          {grouped.modules.map((g) => (
            <section key={g.module.id} className="space-y-2">
              <header className="flex items-baseline gap-2">
                <h3 className="text-base font-semibold">{g.module.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {t('materials.countInModule', { count: g.materials.length })}
                </span>
              </header>
              {g.materials.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">{t('materials.emptyInModule')}</p>
              ) : (
                <div className="space-y-2">{g.materials.map(renderRow)}</div>
              )}
            </section>
          ))}

          {grouped.unassigned.length > 0 ? (
            <section className="space-y-2">
              <header className="flex items-baseline gap-2">
                <h3 className="text-base font-semibold">{t('materials.unassignedGroup')}</h3>
                <span className="text-xs text-muted-foreground">
                  {t('materials.countInModule', { count: grouped.unassigned.length })}
                </span>
              </header>
              <div className="space-y-2">{grouped.unassigned.map(renderRow)}</div>
            </section>
          ) : null}
        </div>
      )}

      {showCreate ? (
        <CreateMaterialDialog
          sourceType={showCreate}
          modules={modulesQ.data ?? []}
          onClose={() => setShowCreate(null)}
          onSubmit={async (input) => {
            try {
              await create.mutateAsync(input);
              toast.push({ title: t('materials.created'), tone: 'success' });
              setShowCreate(null);
            } catch (err) {
              const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
              toast.push({ title: t(i18n), tone: 'error' });
            }
          }}
        />
      ) : null}

      {editing ? (
        <EditMaterialDialog
          material={editing}
          modules={modulesQ.data ?? []}
          courseId={id}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            try {
              await update.mutateAsync({ id: editing.id, input });
              toast.push({ title: t('materials.updated'), tone: 'success' });
              setEditing(null);
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

function groupByModule(
  materials: MaterialSummary[],
  modules: ModuleSummary[],
): {
  modules: Array<{ module: ModuleSummary; materials: MaterialSummary[] }>;
  unassigned: MaterialSummary[];
  totalMaterials: number;
} {
  const byModule = new Map<string, MaterialSummary[]>();
  const unassigned: MaterialSummary[] = [];
  for (const m of materials) {
    if (m.moduleId) {
      const arr = byModule.get(m.moduleId) ?? [];
      arr.push(m);
      byModule.set(m.moduleId, arr);
    } else {
      unassigned.push(m);
    }
  }
  return {
    modules: modules.map((mod) => ({ module: mod, materials: byModule.get(mod.id) ?? [] })),
    unassigned,
    totalMaterials: materials.length,
  };
}

function MaterialRow({
  material: m,
  onPublishToggle,
  onEdit,
  onDelete,
}: {
  material: MaterialSummary;
  onPublishToggle: () => Promise<void>;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{m.title}</span>
            <Badge
              variant={
                m.status === 'published'
                  ? 'success'
                  : m.status === 'draft'
                    ? 'outline'
                    : 'secondary'
              }
            >
              {t(`materials.status${m.status[0]!.toUpperCase()}${m.status.slice(1)}`)}
            </Badge>
            <Badge variant="info">
              {t(`materials.kind${m.sourceType.replace(/(^|_)(\w)/g, (_, _b, c: string) => c.toUpperCase())}`)}
            </Badge>
          </div>
          {m.description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>
          ) : null}
          {m.externalUrl ? (
            <a
              href={m.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sky-600 hover:underline"
            >
              {m.externalUrl}
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onPublishToggle}>
            {m.status === 'published' ? t('materials.unpublish') : t('materials.publish')}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            {t('common.edit')}
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            {t('common.delete')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateMaterialDialog({
  sourceType,
  modules,
  onClose,
  onSubmit,
}: {
  sourceType: 'external_link' | 'manual_text';
  modules: ModuleSummary[];
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    description?: string | null;
    sourceType: 'external_link' | 'manual_text';
    moduleId?: string | null;
    externalUrl?: string;
    content?: string;
  }) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [content, setContent] = useState('');
  const titleLabel = sourceType === 'external_link' ? t('materials.linkCta') : t('materials.textCta');
  return (
    <Dialog open onClose={onClose} title={titleLabel}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({
            title,
            description: description.trim() ? description : null,
            sourceType,
            moduleId: moduleId || null,
            externalUrl: sourceType === 'external_link' ? externalUrl : undefined,
            content: sourceType === 'manual_text' ? content : undefined,
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="title">{t('materials.titleLabel')}</Label>
          <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="description">{t('materials.descriptionLabel')}</Label>
          <Textarea
            id="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="moduleId">{t('materials.module')}</Label>
          <select
            id="moduleId"
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
        {sourceType === 'external_link' ? (
          <div className="space-y-1">
            <Label htmlFor="externalUrl">{t('materials.externalUrl')}</Label>
            <Input
              id="externalUrl"
              type="url"
              required
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="content">{t('materials.content')}</Label>
            <MarkdownEditor id="content" required value={content} onChange={setContent} />
          </div>
        )}
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

function EditMaterialDialog({
  material,
  modules,
  courseId,
  onClose,
  onSubmit,
}: {
  material: MaterialSummary;
  modules: ModuleSummary[];
  courseId: string;
  onClose: () => void;
  onSubmit: (input: UpdateMaterialInput) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description ?? '');
  const [moduleId, setModuleId] = useState(material.moduleId ?? '');
  const [sourceType, setSourceType] = useState<MaterialSourceType>(material.sourceType);
  const [externalUrl, setExternalUrl] = useState(material.externalUrl ?? '');
  const [content, setContent] = useState(material.content ?? '');
  const [fileAssetId, setFileAssetId] = useState<string | null>(material.fileAssetId);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onUpload: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
      toast.push({ title: t('files.invalidType'), tone: 'error' });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.push({ title: t('files.tooLarge'), tone: 'error' });
      return;
    }
    try {
      setUploadProgress(0);
      const result = await uploadFile(file, courseId, 'material', setUploadProgress);
      setFileAssetId(result.fileAssetId);
      setFileName(file.name);
      toast.push({ title: t('materials.uploadComplete'), tone: 'success' });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t('materials.uploadFailed'), description: t(i18n), tone: 'error' });
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
            sourceType,
          };
          if (sourceType === 'external_link') {
            input.externalUrl = externalUrl;
            input.content = null;
            input.fileAssetId = null;
          } else if (sourceType === 'manual_text') {
            input.content = content;
            input.externalUrl = null;
            input.fileAssetId = null;
          } else if (sourceType === 'upload') {
            input.fileAssetId = fileAssetId;
            input.externalUrl = null;
            input.content = null;
          }
          await onSubmit(input);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="edit-title">{t('materials.titleLabel')}</Label>
          <Input id="edit-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-description">{t('materials.descriptionLabel')}</Label>
          <Textarea
            id="edit-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-moduleId">{t('materials.module')}</Label>
          <select
            id="edit-moduleId"
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
        <div className="space-y-1">
          <Label htmlFor="edit-sourceType">{t('materials.sourceType')}</Label>
          <select
            id="edit-sourceType"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as MaterialSourceType)}
          >
            <option value="upload">{t('materials.kindUpload')}</option>
            <option value="external_link">{t('materials.kindExternalLink')}</option>
            <option value="manual_text">{t('materials.kindManualText')}</option>
          </select>
        </div>
        {sourceType === 'external_link' ? (
          <div className="space-y-1">
            <Label htmlFor="edit-externalUrl">{t('materials.externalUrl')}</Label>
            <Input
              id="edit-externalUrl"
              type="url"
              required
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
        ) : null}
        {sourceType === 'manual_text' ? (
          <div className="space-y-1">
            <Label htmlFor="edit-content">{t('materials.content')}</Label>
            <MarkdownEditor id="edit-content" required value={content} onChange={setContent} />
          </div>
        ) : null}
        {sourceType === 'upload' ? (
          <div className="space-y-1">
            <Label>{t('materials.fileLabel')}</Label>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" type="button">
                <label>
                  {fileAssetId ? t('materials.replaceFile') : t('materials.uploadCta')}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={ALLOWED_UPLOAD_MIME_TYPES.join(',')}
                    onChange={onUpload}
                  />
                </label>
              </Button>
              <span className="text-xs text-muted-foreground">
                {fileName ?? (fileAssetId ? t('materials.currentFileAttached') : t('common.none'))}
              </span>
            </div>
            {uploadProgress !== null ? (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={uploadProgress !== null}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
