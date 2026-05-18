import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import {
  uploadFile,
  useCreateMaterial,
  useDeleteMaterial,
  useMaterialsList,
  useModulesList,
  useTransitionMaterial,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, type MaterialSourceType } from '@coursewise/shared';

export function TeacherMaterialsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const materials = useMaterialsList(id);
  const modulesQ = useModulesList(id);
  const create = useCreateMaterial(id);
  const transition = useTransitionMaterial(id);
  const del = useDeleteMaterial(id);
  const toast = useToast();
  const [showCreate, setShowCreate] = useState<Exclude<MaterialSourceType, 'upload'> | null>(null);
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

      {materials.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !materials.data || materials.data.length === 0 ? (
        <EmptyState title={t('materials.empty')} />
      ) : (
        <div className="space-y-2">
          {materials.data.map((m) => (
            <Card key={m.id}>
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
                  {m.status !== 'published' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await transition.mutateAsync({ id: m.id, action: 'publish' });
                          toast.push({ title: t('materials.published'), tone: 'success' });
                        } catch (err) {
                          const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                          toast.push({ title: t(i18n), tone: 'error' });
                        }
                      }}
                    >
                      {t('materials.publish')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await transition.mutateAsync({ id: m.id, action: 'archive' });
                          toast.push({ title: t('materials.archived'), tone: 'success' });
                        } catch (err) {
                          const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                          toast.push({ title: t(i18n), tone: 'error' });
                        }
                      }}
                    >
                      {t('materials.archive')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!window.confirm(`${t('common.delete')}: ${m.title}?`)) return;
                      try {
                        await del.mutateAsync(m.id);
                        toast.push({ title: t('materials.deleted'), tone: 'success' });
                      } catch (err) {
                        const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                        toast.push({ title: t(i18n), tone: 'error' });
                      }
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
    </div>
  );
}

function CreateMaterialDialog({
  sourceType,
  modules,
  onClose,
  onSubmit,
}: {
  sourceType: 'external_link' | 'manual_text';
  modules: Array<{ id: string; title: string }>;
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    sourceType: 'external_link' | 'manual_text';
    moduleId?: string | null;
    externalUrl?: string;
    content?: string;
  }) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
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
            <Textarea id="content" required rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
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

// CardHeader/Title not used here but exported for consistency; suppress unused warnings.
void CardHeader;
void CardTitle;
