import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Circle,
  CircleCheck,
  ExternalLink,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Button } from '@/components/ui/button';
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
      <header>
        <h2 className="text-xl font-semibold">{t('presentations.title')}</h2>
      </header>

      <div className="overflow-hidden rounded-md border">
        {/* Toolbar — students get refresh only; the open action lives on
            each row. */}
        <div className="flex items-center justify-end gap-1.5 border-b bg-muted/30 px-3 py-2">
          <ActionIconButton
            icon={RefreshCw}
            label={t('common.refresh')}
            color="sky"
            size="sm"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
            className={cn(list.isFetching && '[&_svg]:animate-spin')}
          />
        </div>

        {list.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t('presentations.emptyStudent')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('presentations.colTitle')}</TableHead>
                <TableHead>{t('presentations.colDescription')}</TableHead>
                <TableHead>{t('presentations.colModule')}</TableHead>
                <TableHead className="text-right">{t('presentations.colSlides')}</TableHead>
                <TableHead>{t('presentations.colSource')}</TableHead>
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
                    <TableCell className="max-w-[24ch] text-muted-foreground">
                      <span className="line-clamp-1">{p.description ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className={p.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                        {p.moduleId ? (moduleTitleById.get(p.moduleId) ?? '—') : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.slideCount}</TableCell>
                    <TableCell>
                      {isGamma && p.externalUrl ? (
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={p.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {t('gamma.openInGamma')}
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
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
        )}
      </div>
    </div>
  );
}
