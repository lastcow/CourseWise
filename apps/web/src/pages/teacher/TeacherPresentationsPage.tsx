import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Circle,
  CircleCheck,
  ExternalLink,
  FolderInput,
  Presentation,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { Input, Label } from '@/components/ui/input';
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
  uploadFile,
  useCourseGammaPendingJobs,
  useCreatePresentation,
  useDeletePresentation,
  useGammaJob,
  useModulesList,
  usePresentationsList,
  useTransitionPresentation,
  useUpdatePresentation,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { DownloadPresentationButton } from '@/components/presentation/DownloadPresentationButton';
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

function StatusIcon({ status }: { status: PresentationSummary['status'] }): JSX.Element {
  const { t } = useTranslation();
  const label = t(`presentations.status${status[0]!.toUpperCase()}${status.slice(1)}`);
  const Icon = status === 'published' ? CircleCheck : status === 'archived' ? Archive : Circle;
  // Mirror the ActionIconButton visual (h-7 w-7, rounded-md, colored border +
  // text) but as a non-interactive span so it reads as a status indicator
  // rather than a clickable action.
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

export function TeacherPresentationsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = usePresentationsList(id);
  const transition = useTransitionPresentation(id);
  const del = useDeletePresentation(id);
  const update = useUpdatePresentation(id);
  const modulesQ = useModulesList(id || null);
  // Pending Gamma jobs the course already has open from a previous session.
  // Without this, navigating away mid-generation freezes the job at
  // `pending` because pollAndFinalize only runs on demand.
  const pendingJobsQ = useCourseGammaPendingJobs(id || null);
  const toast = useToast();
  const qc = useQueryClient();

  const navigate = useNavigate();
  const location = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<PresentationSummary | null>(null);
  const [moveTarget, setMoveTarget] = useState<PresentationSummary | null>(null);
  const [moveModuleId, setMoveModuleId] = useState<string>('');
  // Upload-presentation dialog state.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadModuleId, setUploadModuleId] = useState<string>('');
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const createPresentation = useCreatePresentation(id);
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

  // Pick up a freshly-started Gamma job handed back by the generate page.
  useEffect(() => {
    const state = (location.state ?? null) as {
      startedGammaJob?: { jobId: string; presentationId: string };
    } | null;
    const started = state?.startedGammaJob;
    if (!started) return;
    setActiveJobIds((prev) => (prev.includes(started.jobId) ? prev : [...prev, started.jobId]));
    setJobStates((prev) =>
      prev[started.jobId]
        ? prev
        : { ...prev, [started.jobId]: { presentationId: started.presentationId, jobCreatedAt: null } },
    );
    void qc.invalidateQueries({ queryKey: ['presentations', id] });
    // Clear the navigation state so it doesn't re-fire on next render.
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate, id, qc]);

  // Resume polling any Gamma jobs that were left mid-flight by a previous
  // session. Once seeded into activeJobIds, the GammaJobWatcher mounts and
  // pollAndFinalize takes over from there.
  useEffect(() => {
    const jobs = pendingJobsQ.data?.jobs;
    if (!jobs || jobs.length === 0) return;
    setActiveJobIds((prev) => {
      const next = new Set(prev);
      for (const j of jobs) next.add(j.id);
      return Array.from(next);
    });
    setJobStates((prev) => {
      const next = { ...prev };
      for (const j of jobs) {
        if (!next[j.id]) {
          next[j.id] = { presentationId: j.presentationId, jobCreatedAt: j.createdAt };
        }
      }
      return next;
    });
  }, [pendingJobsQ.data]);

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
      <CourseSectionHeader
        title={t('presentations.title')}
        count={list.data?.length}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setUploadTitle('');
                setUploadModuleId('');
                setUploadFileObj(null);
                setUploadOpen(true);
              }}
            >
              <Upload className="mr-1 h-4 w-4" aria-hidden />
              {t('presentations.uploadButton')}
            </Button>
            <Button
              size="sm"
              onClick={() => navigate(`/teacher/courses/${id}/presentations/new-gamma`)}
            >
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
          </>
        }
      />

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

      {list.isLoading ? (
        <ListSkeleton />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState icon={<Presentation className="h-6 w-6" />} title={t('presentations.empty')} />
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
                        <TableCell colSpan={4} className="bg-muted/30">
                          <GammaProgressBar createdAt={jobCreatedAt} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

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
        open={uploadOpen}
        onClose={() => (uploading ? undefined : setUploadOpen(false))}
        title={t('presentations.uploadTitle')}
        dismissOnBackdropClick={false}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="upload-title">{t('presentations.titleLabel')}</Label>
            <Input
              id="upload-title"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              maxLength={200}
              placeholder={t('presentations.titlePlaceholder')}
            />
          </div>
          <div>
            <Label htmlFor="upload-module">{t('presentations.moduleLabel')}</Label>
            <select
              id="upload-module"
              value={uploadModuleId}
              onChange={(e) => setUploadModuleId(e.target.value)}
              disabled={modulesQ.isLoading}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t('presentations.unassignedModule')}</option>
              {(modulesQ.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="upload-file">{t('presentations.fileLabel')}</Label>
            <input
              id="upload-file"
              type="file"
              accept=".pptx,.ppt,.pdf,.key,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > 50 * 1024 * 1024) {
                  toast.push({ title: t('presentations.fileTooLarge'), tone: 'error' });
                  e.target.value = '';
                  return;
                }
                setUploadFileObj(f);
              }}
              className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('presentations.fileHint')}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!uploadTitle.trim() || !uploadFileObj || uploading}
            onClick={async () => {
              if (!uploadFileObj) return;
              setUploading(true);
              try {
                const { fileAssetId } = await uploadFile(uploadFileObj, id, 'presentation');
                await createPresentation.mutateAsync({
                  title: uploadTitle.trim(),
                  moduleId: uploadModuleId || null,
                  fileAssetId,
                });
                toast.push({ title: t('presentations.uploadCreated'), tone: 'success' });
                setUploadOpen(false);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({
                  title: t(key),
                  description: err instanceof Error ? err.message : undefined,
                  tone: 'error',
                });
              } finally {
                setUploading(false);
              }
            }}
          >
            {uploading ? t('presentations.uploading') : t('presentations.createCta')}
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
