import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Circle,
  CircleCheck,
  ExternalLink,
  Eye,
  Presentation,
  RefreshCw,
} from 'lucide-react';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { DownloadPresentationButton } from '@/components/presentation/DownloadPresentationButton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useModulesList, usePresentationsList } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { PresentationSummary } from '@coursewise/shared';

/**
 * Same status-icon vocabulary as the teacher Presentations page so both
 * views read as the same screen with role-specific affordances.
 */
function StatusIcon({ status }: { status: PresentationSummary['status'] }): JSX.Element {
  const { t } = useTranslation();
  const label = t(`presentations.status${status[0]!.toUpperCase()}${status.slice(1)}`);
  const Icon = status === 'published' ? CircleCheck : status === 'archived' ? Archive : Circle;
  const tone =
    status === 'published'
      ? 'border-emerald-500/60 text-emerald-500'
      : status === 'archived'
        ? 'border-orange-500/60 text-orange-500'
        : 'border-slate-400/60 text-slate-400';
  return (
    <span
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border bg-transparent ${tone}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export function StudentPresentationsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const navigate = useNavigate();
  const list = usePresentationsList(id);
  const modulesQ = useModulesList(id || null);

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));

  return (
    <div className="space-y-4">
      <CourseSectionHeader
        title={t('presentations.title')}
        count={list.data?.length}
        actions={
          <ActionIconButton
            icon={RefreshCw}
            label={t('common.refresh')}
            color="sky"
            size="sm"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
            className={cn(list.isFetching && '[&_svg]:animate-spin')}
          />
        }
      />

      {list.isLoading ? (
        <ListSkeleton />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState
          icon={<Presentation className="h-6 w-6" />}
          title={t('presentations.emptyStudent')}
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('presentations.colTitle')}</TableHead>
                <TableHead>{t('presentations.colModule')}</TableHead>
                <TableHead className="text-right">{t('presentations.colSlides')}</TableHead>
                <TableHead className="text-right">{t('presentations.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((p) => {
                const isGamma = p.provider === 'gamma';
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={p.status} />
                        <Link
                          to={`/student/courses/${id}/presentations/${p.id}`}
                          className="hover:underline"
                        >
                          {p.title}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={p.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                        {p.moduleId ? (moduleTitleById.get(p.moduleId) ?? '—') : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.slideCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {isGamma && p.externalUrl ? (
                          <ActionIconButton
                            icon={ExternalLink}
                            label={t('gamma.openInGamma')}
                            color="sky"
                            onClick={() =>
                              window.open(p.externalUrl!, '_blank', 'noopener,noreferrer')
                            }
                          />
                        ) : null}
                        {p.fileAssetId ? (
                          <DownloadPresentationButton
                            fileAssetId={p.fileAssetId}
                            iconOnly
                            className="h-8 w-8 p-0"
                          />
                        ) : null}
                        <ActionIconButton
                          icon={Eye}
                          label={t('presentations.openViewer')}
                          color="sky"
                          onClick={() =>
                            navigate(`/student/courses/${id}/presentations/${p.id}`)
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
