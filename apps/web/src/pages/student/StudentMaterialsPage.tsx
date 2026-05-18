import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { getDownloadUrl, useMaterialsList, useModulesList } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import type { MaterialSummary, ModuleSummary } from '@coursewise/shared';

export function StudentMaterialsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const materialsQ = useMaterialsList(id);
  const modulesQ = useModulesList(id);
  const toast = useToast();

  const grouped = useMemo(() => groupByModule(materialsQ.data ?? [], modulesQ.data ?? []), [
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
      ) : grouped.totalMaterials === 0 ? (
        <EmptyState title={t('materials.empty')} />
      ) : (
        <div className="space-y-6">
          {grouped.modules.map((g) =>
            g.materials.length === 0 ? null : (
              <section key={g.module.id} className="space-y-2">
                <header className="flex items-baseline gap-2">
                  <h2 className="text-base font-semibold">{g.module.title}</h2>
                  {g.module.description ? (
                    <span className="text-xs text-muted-foreground">— {g.module.description}</span>
                  ) : null}
                </header>
                <div className="space-y-2">
                  {g.materials.map((m) => (
                    <StudentRow key={m.id} material={m} onDownload={onDownload} />
                  ))}
                </div>
              </section>
            ),
          )}
          {grouped.unassigned.length > 0 ? (
            <section className="space-y-2">
              <header>
                <h2 className="text-base font-semibold">{t('materials.unassignedGroup')}</h2>
              </header>
              <div className="space-y-2">
                {grouped.unassigned.map((m) => (
                  <StudentRow key={m.id} material={m} onDownload={onDownload} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StudentRow({
  material: m,
  onDownload,
}: {
  material: MaterialSummary;
  onDownload: (fileAssetId: string) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{m.title}</span>
            <Badge variant="info">
              {t(`materials.kind${m.sourceType.replace(/(^|_)(\w)/g, (_, _b, c: string) => c.toUpperCase())}`)}
            </Badge>
          </div>
          {m.description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>
          ) : null}
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
