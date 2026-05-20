import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { MarkdownView } from '@/components/ui/markdown';
import { getDownloadUrl, useMaterial, useModulesList } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';

export function StudentMaterialDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const { courseId, materialId } = useParams();
  const courseIdSafe = courseId ?? '';
  const materialQ = useMaterial(materialId ?? null);
  const modulesQ = useModulesList(courseId ?? null);
  const [downloading, setDownloading] = useState(false);

  if (materialQ.isLoading) {
    return <p>{t('common.loading')}</p>;
  }

  const mat = materialQ.data;
  if (!mat) {
    return (
      <div className="space-y-3">
        <BackLink courseId={courseIdSafe} />
        <EmptyState title={t('materials.notFound')} />
      </div>
    );
  }

  const moduleTitle = mat.moduleId
    ? (modulesQ.data ?? []).find((m) => m.id === mat.moduleId)?.title ?? null
    : null;

  const kindKey =
    mat.sourceType === 'upload'
      ? 'materials.kindUpload'
      : mat.sourceType === 'external_link'
        ? 'materials.kindExternalLink'
        : 'materials.kindManualText';

  async function onDownload(): Promise<void> {
    if (!mat?.fileAssetId) return;
    setDownloading(true);
    try {
      const { downloadUrl } = await getDownloadUrl(mat.fileAssetId);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink courseId={courseIdSafe} />

      <header className="space-y-3 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{mat.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{t(kindKey)}</Badge>
          <span className="text-xs text-muted-foreground">
            {t('materials.deleteConfirmLastUpdated')}:{' '}
            {new Date(mat.updatedAt).toLocaleDateString()}
          </span>
        </div>
        {moduleTitle ? (
          <div className="text-sm text-muted-foreground">
            {t('materials.module')}: <span className="text-foreground">{moduleTitle}</span>
          </div>
        ) : null}
        {mat.description ? (
          <p className="text-sm text-muted-foreground">{mat.description}</p>
        ) : null}
      </header>

      <div>
        {mat.sourceType === 'manual_text' ? (
          mat.content ? (
            <MarkdownView source={mat.content} />
          ) : (
            <EmptyState title={t('materials.emptyContent')} />
          )
        ) : mat.sourceType === 'external_link' && mat.externalUrl ? (
          <Button asChild>
            <a href={mat.externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              {t('materials.openLink')}
            </a>
          </Button>
        ) : mat.sourceType === 'upload' && mat.fileAssetId ? (
          <Button onClick={onDownload} disabled={downloading}>
            <Download className="mr-1.5 h-4 w-4" />
            {downloading ? t('common.loading') : t('common.download')}
          </Button>
        ) : (
          <EmptyState title={t('materials.emptyContent')} />
        )}
      </div>
    </div>
  );
}

function BackLink({ courseId }: { courseId: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <Link
      to={`/student/courses/${courseId}/modules`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {t('materials.backToModules')}
    </Link>
  );
}
