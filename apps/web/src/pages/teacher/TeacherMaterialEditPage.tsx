import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  type MaterialSourceType,
  type UpdateMaterialInput,
} from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label, Textarea } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import {
  uploadFile,
  useMaterial,
  useModulesList,
  useUpdateMaterial,
} from '@/lib/queries';

export function TeacherMaterialEditPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { courseId, materialId } = useParams();
  const courseIdSafe = courseId ?? '';
  const materialIdSafe = materialId ?? '';
  const materialQ = useMaterial(materialId ?? null);
  const modulesQ = useModulesList(courseId ?? null);
  const update = useUpdateMaterial(courseIdSafe);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [sourceType, setSourceType] = useState<MaterialSourceType>('manual_text');
  const [externalUrl, setExternalUrl] = useState('');
  const [content, setContent] = useState('');
  const [fileAssetId, setFileAssetId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seed local state once when the material loads. We don't keep the form in
  // sync with subsequent refetches — the user's in-flight edits win.
  useEffect(() => {
    if (hydrated) return;
    const m = materialQ.data;
    if (!m) return;
    setTitle(m.title);
    setDescription(m.description ?? '');
    setModuleId(m.moduleId ?? '');
    setSourceType(m.sourceType);
    setExternalUrl(m.externalUrl ?? '');
    setContent(m.content ?? '');
    setFileAssetId(m.fileAssetId);
    setHydrated(true);
  }, [materialQ.data, hydrated]);

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
      const result = await uploadFile(file, courseIdSafe, 'material', setUploadProgress);
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

  async function onSubmit(e: React.FormEvent): Promise<void> {
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
    try {
      await update.mutateAsync({ id: materialIdSafe, input });
      toast.push({ title: t('materials.updated'), tone: 'success' });
      navigate(`/teacher/courses/${courseIdSafe}/materials/${materialIdSafe}`);
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  }

  if (materialQ.isLoading || (!materialQ.data && !materialQ.isError)) {
    return <p>{t('common.loading')}</p>;
  }

  if (!materialQ.data) {
    return (
      <div className="space-y-3">
        <Link
          to={`/teacher/courses/${courseIdSafe}/modules`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('materials.backToModules')}
        </Link>
        <EmptyState title={t('materials.notFound')} />
      </div>
    );
  }

  const detailPath = `/teacher/courses/${courseIdSafe}/materials/${materialIdSafe}`;
  const modules = modulesQ.data ?? [];

  return (
    <div className="space-y-6">
      <Link
        to={detailPath}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('materials.backToMaterial')}
      </Link>

      <header className="border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('materials.editTitle')}</h1>
      </header>

      <form className="space-y-4" onSubmit={onSubmit}>
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
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button asChild type="button" variant="outline">
            <Link to={detailPath}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" disabled={uploadProgress !== null || update.isPending}>
            {update.isPending ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
