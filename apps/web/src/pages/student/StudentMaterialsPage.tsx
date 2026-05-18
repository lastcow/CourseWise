import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { getDownloadUrl, useMaterialsList } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';

export function StudentMaterialsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const materials = useMaterialsList(id);
  const toast = useToast();

  const onDownload = async (fileAssetId: string) => {
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
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('materials.title')}</h1>
      </header>
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
                    <Badge variant="info">
                      {t(`materials.kind${m.sourceType.replace(/(^|_)(\w)/g, (_, _b, c: string) => c.toUpperCase())}`)}
                    </Badge>
                  </div>
                  {m.sourceType === 'manual_text' && m.content ? (
                    <div className="mt-2 whitespace-pre-wrap rounded bg-muted/30 p-3 text-sm">{m.content}</div>
                  ) : null}
                </div>
                <div>
                  {m.sourceType === 'upload' && m.fileAssetId ? (
                    <Button size="sm" onClick={() => onDownload(m.fileAssetId!)}>
                      {t('materials.download')}
                    </Button>
                  ) : null}
                  {m.sourceType === 'external_link' && m.externalUrl ? (
                    <Button asChild size="sm">
                      <a href={m.externalUrl} target="_blank" rel="noreferrer">
                        {t('materials.open')}
                      </a>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
