import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  CircleCheck,
  Download,
  ExternalLink,
  FilePlus,
  FileText,
  Link2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { ActionMenu, ActionMenuItem } from '@/components/ui/action-menu';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { cn } from '@/lib/utils';
import { downloadMaterialAsMarkdown } from '@/lib/materialDownload';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getDownloadUrl,
  uploadFile,
  useCreateMaterial,
  useDeleteMaterial,
  useMaterialsList,
  useModulesList,
  useTransitionMaterial,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import {
  UPLOAD_ACCEPT,
  isAllowedUploadFile,
  MAX_UPLOAD_BYTES,
  type MaterialSourceType,
  type MaterialSummary,
  type ModuleSummary,
} from '@coursewise/shared';

export function TeacherMaterialsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const navigate = useNavigate();
  const materialsQ = useMaterialsList(id);
  const modulesQ = useModulesList(id);
  const create = useCreateMaterial(id);
  const transition = useTransitionMaterial(id);
  const del = useDeleteMaterial(id);
  const toast = useToast();
  const [showCreate, setShowCreate] = useState<Exclude<MaterialSourceType, 'upload'> | null>(null);
  const [deleting, setDeleting] = useState<MaterialSummary | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const moduleTitleById = useMemo(
    () => new Map((modulesQ.data ?? []).map((m) => [m.id, m.title])),
    [modulesQ.data],
  );

  const rows = useMemo(
    () => sortForTable(materialsQ.data ?? [], modulesQ.data ?? []),
    [materialsQ.data, modulesQ.data],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) => {
      const moduleName = m.moduleId ? (moduleTitleById.get(m.moduleId) ?? '') : '';
      return `${m.title} ${m.description ?? ''} ${moduleName}`.toLowerCase().includes(q);
    });
  }, [rows, search, moduleTitleById]);

  const onUpload: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAllowedUploadFile(file.name, file.type)) {
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

  const onPublishToggle = async (m: MaterialSummary) => {
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
  };

  const deletingModuleTitle = deleting?.moduleId
    ? (moduleTitleById.get(deleting.moduleId) ?? null)
    : null;

  const onDownloadFile = async (fileAssetId: string) => {
    try {
      const presign = await getDownloadUrl(fileAssetId);
      window.open(presign.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const i18nKey = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18nKey), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <CourseSectionHeader title={t('materials.title')} count={materialsQ.data?.length} />

      {uploadProgress !== null ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          {t('materials.uploading', { progress: uploadProgress })}
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      ) : null}

      {materialsQ.isLoading ? (
        <ListSkeleton />
      ) : (
        <div className="overflow-hidden rounded-md border">
          {/* Toolbar attached to the table: search on the left; upload / add
              link / add text + refresh (icon-only) at the right, with a
              vertical separator before refresh. */}
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={UPLOAD_ACCEPT}
              onChange={onUpload}
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('materials.searchPlaceholder')}
              className="h-8 w-56"
            />
            <div className="ml-auto flex items-center gap-2">
              <ActionIconButton
                icon={Upload}
                label={t('materials.uploadCta')}
                color="emerald"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadProgress !== null}
              />
              <ActionIconButton
                icon={Link2}
                label={t('materials.linkCta')}
                color="sky"
                size="sm"
                onClick={() => setShowCreate('external_link')}
              />
              <ActionIconButton
                icon={FilePlus}
                label={t('materials.textCta')}
                color="sky"
                size="sm"
                onClick={() => setShowCreate('manual_text')}
              />
              <div className="mx-1 h-5 w-px bg-border" aria-hidden />
              <ActionIconButton
                icon={RefreshCw}
                label={t('common.refresh')}
                color="sky"
                size="sm"
                onClick={() => void materialsQ.refetch()}
                disabled={materialsQ.isFetching}
                className={cn(materialsQ.isFetching && '[&_svg]:animate-spin')}
              />
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={<FileText className="h-6 w-6" />} title={t('materials.empty')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('materials.colTitle')}</TableHead>
                  <TableHead>{t('materials.colSource')}</TableHead>
                  <TableHead>{t('materials.colStatus')}</TableHead>
                  <TableHead>{t('materials.colUpdated')}</TableHead>
                  <TableHead className="text-right">{t('materials.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {t('materials.noSearchMatch')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        <Link
                          to={`/teacher/courses/${id}/materials/${m.id}`}
                          className="hover:underline"
                        >
                          {m.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="info">{t(kindKey(m.sourceType))}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(m.status)}>{t(statusKey(m.status))}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(m.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <ActionMenu label={t('materials.colActions')} size="sm">
                            <ActionMenuItem
                              icon={Download}
                              onSelect={() => {
                                if (m.sourceType === 'upload' && m.fileAssetId)
                                  void onDownloadFile(m.fileAssetId);
                                else downloadMaterialAsMarkdown(m);
                              }}
                            >
                              {t('materials.download')}
                            </ActionMenuItem>
                            {m.sourceType === 'external_link' && m.externalUrl ? (
                              <ActionMenuItem
                                icon={ExternalLink}
                                onSelect={() =>
                                  window.open(m.externalUrl!, '_blank', 'noopener,noreferrer')
                                }
                              >
                                {t('materials.open')}
                              </ActionMenuItem>
                            ) : null}
                            <ActionMenuItem
                              icon={m.status === 'published' ? Archive : CircleCheck}
                              onSelect={() => void onPublishToggle(m)}
                            >
                              {m.status === 'published'
                                ? t('materials.unpublish')
                                : t('materials.publish')}
                            </ActionMenuItem>
                            <ActionMenuItem
                              icon={Pencil}
                              onSelect={() =>
                                navigate(`/teacher/courses/${id}/materials/${m.id}/edit`)
                              }
                            >
                              {t('common.edit')}
                            </ActionMenuItem>
                            <ActionMenuItem
                              icon={Trash2}
                              tone="destructive"
                              onSelect={() => setDeleting(m)}
                            >
                              {t('common.delete')}
                            </ActionMenuItem>
                          </ActionMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
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

      <DeleteMaterialConfirmDialog
        material={deleting}
        moduleTitle={deletingModuleTitle}
        pending={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast.push({ title: t('materials.deleted'), tone: 'success' });
            setDeleting(null);
          } catch (err) {
            const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
            toast.push({ title: t(i18n), tone: 'error' });
          }
        }}
      />
    </div>
  );
}

function kindKey(sourceType: MaterialSourceType): string {
  return sourceType === 'upload'
    ? 'materials.kindUpload'
    : sourceType === 'external_link'
      ? 'materials.kindExternalLink'
      : 'materials.kindManualText';
}

function statusKey(status: MaterialSummary['status']): string {
  return status === 'published'
    ? 'materials.statusPublished'
    : status === 'archived'
      ? 'materials.statusArchived'
      : 'materials.statusDraft';
}

function statusVariant(status: MaterialSummary['status']): 'success' | 'outline' | 'secondary' {
  return status === 'published' ? 'success' : status === 'draft' ? 'outline' : 'secondary';
}

// Sort: materials in module order (using the modules list to define order), then
// unassigned materials at the bottom. Within each group, newest-updated first so
// recent edits stay near the top — matches the previous grouped layout's intent.
function sortForTable(materials: MaterialSummary[], modules: ModuleSummary[]): MaterialSummary[] {
  const order = new Map(modules.map((m, i) => [m.id, i]));
  return [...materials].sort((a, b) => {
    const ai = a.moduleId
      ? (order.get(a.moduleId) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
    const bi = b.moduleId
      ? (order.get(b.moduleId) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function DeleteMaterialConfirmDialog({
  material,
  moduleTitle,
  pending,
  onCancel,
  onConfirm,
}: {
  material: MaterialSummary | null;
  moduleTitle: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();

  const lastUpdated = material ? new Date(material.updatedAt).toLocaleDateString() : '';

  return (
    <Dialog
      open={material !== null}
      onClose={pending ? () => undefined : onCancel}
      title={t('materials.deleteConfirmTitle')}
    >
      {material ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('materials.deleteConfirmBody')}</p>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="break-words text-sm font-semibold">{material.title}</div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <dt>{t('materials.module')}</dt>
              <dd className="text-foreground">{moduleTitle ?? t('materials.unassigned')}</dd>
              <dt>{t('materials.sourceType')}</dt>
              <dd className="flex items-center gap-2 text-foreground">
                <Badge variant="secondary">{t(kindKey(material.sourceType))}</Badge>
                <Badge variant="secondary">{t(statusKey(material.status))}</Badge>
              </dd>
              <dt>{t('materials.deleteConfirmLastUpdated')}</dt>
              <dd className="text-foreground">{lastUpdated}</dd>
            </dl>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void onConfirm()} disabled={pending}>
              {pending ? t('common.loading') : t('materials.deleteConfirmAction')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
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
  const titleLabel =
    sourceType === 'external_link' ? t('materials.linkCta') : t('materials.textCta');
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
