import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Circle,
  CircleCheck,
  Download,
  ExternalLink,
  FolderInput,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import {
  getDownloadUrl,
  useDeletePresentation,
  useGammaJob,
  useModulesList,
  usePresentationsList,
  useTransitionPresentation,
  useUpdatePresentation,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { GenerateGammaDialog } from '@/components/gamma/GenerateGammaDialog';
import { GammaProgressBar } from '@/components/ai/GammaProgressBar';
import type { PresentationSummary } from '@coursewise/shared';

type ActiveJobState = { presentationId: string | null; jobCreatedAt: string | null };

type GammaJobWatcherProps = {
  jobId: string;
  courseId: string;
  onResolved: (jobId: string, status: 'completed' | 'failed', errorMessage?: string | null) => void;
  onJobUpdate: (jobId: string, state: ActiveJobState) => void;
};

/**
 * Invisible component that polls a single Gamma job. When the job lands
 * (completed/failed), it bubbles up so the parent can stop tracking it and
 * surface a toast.
 */
function GammaJobWatcher({ jobId, onResolved, onJobUpdate }: GammaJobWatcherProps): null {
  const q = useGammaJob(jobId, true);
  const status = q.data?.status;
  const presentationId = q.data?.presentationId ?? null;
  const jobCreatedAt = q.data?.createdAt ?? null;
  const errorMessage = q.data?.errorMessage ?? null;

  useEffect(() => {
    onJobUpdate(jobId, { presentationId, jobCreatedAt });
  }, [jobId, presentationId, jobCreatedAt, onJobUpdate]);

  useEffect(() => {
    if (status === 'completed' || status === 'failed') {
      onResolved(jobId, status, errorMessage);
    }
  }, [jobId, status, errorMessage, onResolved]);

  return null;
}

function DownloadPptxButton({
  fileAssetId,
  label,
}: {
  fileAssetId: string;
  label: string;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await getDownloadUrl(fileAssetId);
          window.location.href = res.downloadUrl;
        } catch (err) {
          const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
          toast.push({ title: t(key), tone: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}

function StatusIcon({ status }: { status: PresentationSummary['status'] }): JSX.Element {
  const { t } = useTranslation();
  const label = t(`presentations.status${status[0]!.toUpperCase()}${status.slice(1)}`);
  const Icon = status === 'published' ? CircleCheck : status === 'archived' ? Archive : Circle;
  const tone =
    status === 'published'
      ? 'text-emerald-500'
      : status === 'archived'
        ? 'text-amber-500'
        : 'text-slate-400';
  return (
    <Badge variant="outline" className="px-1.5 py-0.5" aria-label={label} title={label}>
      <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden />
    </Badge>
  );
}

export function TeacherPresentationsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = usePresentationsList(id);
  const transition = useTransitionPresentation(id);
  const del = useDeletePresentation(id);
  const update = useUpdatePresentation(id);
  const modulesQ = useModulesList(id || null);
  const toast = useToast();
  const qc = useQueryClient();

  const [gammaOpen, setGammaOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PresentationSummary | null>(null);
  const [moveTarget, setMoveTarget] = useState<PresentationSummary | null>(null);
  const [moveModuleId, setMoveModuleId] = useState<string>('');
  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);
  // Map jobId → { presentationId, jobCreatedAt } so rows can render the live
  // progress bar while we're still polling.
  const [jobStates, setJobStates] = useState<Record<string, ActiveJobState>>({});

  const onJobResolved = useCallback(
    (jobId: string, status: 'completed' | 'failed', errorMessage?: string | null) => {
      setActiveJobIds((prev) => prev.filter((x) => x !== jobId));
      setJobStates((prev) => {
        if (!(jobId in prev)) return prev;
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['presentations', id] });
      if (status === 'failed') {
        toast.push({
          title: t('gamma.failed'),
          description: errorMessage ?? undefined,
          tone: 'error',
        });
      }
    },
    [id, qc, t, toast],
  );

  const onJobUpdate = useCallback((jobId: string, state: ActiveJobState) => {
    setJobStates((prev) => {
      const existing = prev[jobId];
      if (
        existing &&
        existing.presentationId === state.presentationId &&
        existing.jobCreatedAt === state.jobCreatedAt
      ) {
        return prev;
      }
      return { ...prev, [jobId]: state };
    });
  }, []);

  // presentationId → its job's createdAt, so rows can find their progress.
  const pendingByPresentation = new Map<string, string | null>();
  for (const state of Object.values(jobStates)) {
    if (state.presentationId) {
      pendingByPresentation.set(state.presentationId, state.jobCreatedAt);
    }
  }

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('presentations.title')}</h2>
      </header>

      {/* Invisible job watchers; one per active jobId. */}
      {activeJobIds.map((jobId) => (
        <GammaJobWatcher
          key={jobId}
          jobId={jobId}
          courseId={id}
          onResolved={onJobResolved}
          onJobUpdate={onJobUpdate}
        />
      ))}

      <div className="overflow-hidden rounded-md border">
        <div className="flex items-center justify-end gap-1.5 border-b bg-muted/30 px-3 py-2">
          <Button variant="outline" size="sm" onClick={() => setGammaOpen(true)}>
            {t('gamma.generateButton')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
          >
            <RefreshCw
              className={list.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
              aria-hidden
            />
          </Button>
        </div>
        {list.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t('presentations.empty')}
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
                const jobCreatedAt = isGamma ? (pendingByPresentation.get(p.id) ?? null) : null;
                const isGenerating = isGamma && pendingByPresentation.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <StatusIcon status={p.status} />
                          <Link
                            to={`/teacher/courses/${id}/presentations/${p.id}`}
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
                        <div className="flex items-center justify-between gap-2">
                          <span className={p.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                            {p.moduleId ? (moduleTitleById.get(p.moduleId) ?? '—') : '—'}
                          </span>
                          <ActionIconButton
                            icon={FolderInput}
                            label={t('presentations.linkModuleAction')}
                            color="sky"
                            size="sm"
                            onClick={() => {
                              setMoveModuleId(p.moduleId ?? '');
                              setMoveTarget(p);
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.slideCount}</TableCell>
                      <TableCell>
                        {isGamma && (p.externalUrl || p.fileAssetId) ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {p.externalUrl ? (
                              <Button size="sm" variant="outline" asChild>
                                <a href={p.externalUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  {t('gamma.openInGamma')}
                                </a>
                              </Button>
                            ) : null}
                            {p.fileAssetId ? (
                              <DownloadPptxButton
                                fileAssetId={p.fileAssetId}
                                label={t('gamma.downloadPptx')}
                              />
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status !== 'published' ? (
                            <ActionIconButton
                              icon={CircleCheck}
                              label={t('presentations.publish')}
                              color="emerald"
                              onClick={async () => {
                                await transition.mutateAsync({ id: p.id, action: 'publish' });
                                toast.push({
                                  title: t('presentations.published'),
                                  tone: 'success',
                                });
                              }}
                            />
                          ) : null}
                          {p.status !== 'archived' ? (
                            <ActionIconButton
                              icon={Archive}
                              label={t('presentations.archive')}
                              color="orange"
                              onClick={async () => {
                                await transition.mutateAsync({ id: p.id, action: 'archive' });
                                toast.push({ title: t('presentations.archived'), tone: 'success' });
                              }}
                            />
                          ) : null}
                          <ActionIconButton
                            icon={Trash2}
                            label={t('common.delete')}
                            color="red"
                            onClick={() => setDeleteTarget(p)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                    {isGenerating && jobCreatedAt ? (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30">
                          <GammaProgressBar createdAt={jobCreatedAt} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <GenerateGammaDialog
        open={gammaOpen}
        onClose={() => setGammaOpen(false)}
        courseId={id}
        onStarted={(jobId, presentationId) => {
          setActiveJobIds((prev) => [...prev, jobId]);
          setJobStates((prev) => ({
            ...prev,
            [jobId]: { presentationId, jobCreatedAt: null },
          }));
          void qc.invalidateQueries({ queryKey: ['presentations', id] });
        }}
      />

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('presentations.deleteDialogTitle')}
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">{t('presentations.deleteConfirm')}</p>
        {deleteTarget ? <p className="mt-2 text-sm font-medium">{deleteTarget.title}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              if (!deleteTarget) return;
              try {
                await del.mutateAsync(deleteTarget.id);
                toast.push({ title: t('presentations.deleted'), tone: 'success' });
                setDeleteTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {t('common.delete')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        title={t('presentations.linkModuleTitle')}
        dismissOnBackdropClick={false}
      >
        <div className="space-y-2">
          <Label htmlFor="move-module">{t('presentations.moduleLabel')}</Label>
          <select
            id="move-module"
            value={moveModuleId}
            onChange={(e) => setMoveModuleId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={modulesQ.isLoading}
          >
            <option value="">{t('presentations.unassignedModule')}</option>
            {(modulesQ.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMoveTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={update.isPending}
            onClick={async () => {
              if (!moveTarget) return;
              try {
                await update.mutateAsync({
                  id: moveTarget.id,
                  input: { moduleId: moveModuleId || null },
                });
                toast.push({ title: t('presentations.moduleUpdated'), tone: 'success' });
                setMoveTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
