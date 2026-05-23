import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink } from 'lucide-react';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { stripMarkdown } from '@/components/ui/markdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getDownloadUrl, useMaterialsList, useModulesList } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import type { MaterialSourceType, MaterialSummary, ModuleSummary } from '@coursewise/shared';

export function StudentMaterialsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const materialsQ = useMaterialsList(id);
  const modulesQ = useModulesList(id);
  const toast = useToast();

  const moduleTitleById = useMemo(
    () => new Map((modulesQ.data ?? []).map((m) => [m.id, m.title])),
    [modulesQ.data],
  );

  const rows = useMemo(() => sortForTable(materialsQ.data ?? [], modulesQ.data ?? []), [
    materialsQ.data,
    modulesQ.data,
  ]);

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
      {materialsQ.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState title={t('materials.empty')} />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('materials.colTitle')}</TableHead>
                <TableHead>{t('materials.colDescription')}</TableHead>
                <TableHead>{t('materials.colModule')}</TableHead>
                <TableHead>{t('materials.colSource')}</TableHead>
                <TableHead className="text-right">{t('materials.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/student/courses/${id}/materials/${m.id}`}
                      className="hover:underline"
                    >
                      {m.title}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[32ch] text-muted-foreground">
                    <span className="line-clamp-1">
                      {m.description ? stripMarkdown(m.description) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={m.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                      {m.moduleId
                        ? moduleTitleById.get(m.moduleId) ?? '—'
                        : t('materials.unassigned')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="info">{t(kindKey(m.sourceType))}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      {m.sourceType === 'upload' && m.fileAssetId ? (
                        <ActionIconButton
                          icon={Download}
                          label={t('materials.download')}
                          color="sky"
                          onClick={() => onDownload(m.fileAssetId!)}
                        />
                      ) : null}
                      {m.sourceType === 'external_link' && m.externalUrl ? (
                        <ActionIconButton
                          asChild
                          icon={ExternalLink}
                          label={t('materials.open')}
                          color="sky"
                        >
                          <a href={m.externalUrl} target="_blank" rel="noreferrer" />
                        </ActionIconButton>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
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

function sortForTable(
  materials: MaterialSummary[],
  modules: ModuleSummary[],
): MaterialSummary[] {
  const order = new Map(modules.map((m, i) => [m.id, i]));
  return [...materials].sort((a, b) => {
    const ai = a.moduleId ? order.get(a.moduleId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const bi = b.moduleId ? order.get(b.moduleId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}
