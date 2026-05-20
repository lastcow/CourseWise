import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Archive, CircleCheck, Download, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import {
  getDownloadUrl,
  useCreatePresentation,
  useDeletePresentation,
  useGammaJob,
  usePresentationsList,
  useTransitionPresentation,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { GenerateGammaDialog } from '@/components/gamma/GenerateGammaDialog';
import { GammaProgressBar } from '@/components/ai/GammaProgressBar';

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
function GammaJobWatcher({
  jobId,
  onResolved,
  onJobUpdate,
}: GammaJobWatcherProps): null {
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

function DownloadPptxButton({ fileAssetId, label }: { fileAssetId: string; label: string }): JSX.Element {
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

export function TeacherPresentationsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = usePresentationsList(id);
  const create = useCreatePresentation(id);
  const transition = useTransitionPresentation(id);
  const del = useDeletePresentation(id);
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');

  const [gammaOpen, setGammaOpen] = useState(false);
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

  // presentationId → its job's createdAt, so cards can find their progress.
  const pendingByPresentation = new Map<string, string | null>();
  for (const state of Object.values(jobStates)) {
    if (state.presentationId) {
      pendingByPresentation.set(state.presentationId, state.jobCreatedAt);
    }
  }

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await create.mutateAsync({ title: title.trim(), description: desc.trim() || null });
      toast.push({ title: t('presentations.created'), tone: 'success' });
      setOpen(false);
      setTitle('');
      setDesc('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('presentations.title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setGammaOpen(true)}>
            {t('gamma.generateButton')}
          </Button>
          <Button onClick={() => setOpen(true)}>{t('presentations.newCta')}</Button>
        </div>
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

      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('presentations.empty')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((p) => {
            const isGamma = p.provider === 'gamma';
            const jobCreatedAt = isGamma ? pendingByPresentation.get(p.id) ?? null : null;
            const isGenerating = isGamma && pendingByPresentation.has(p.id);
            return (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      <Link
                        to={`/teacher/courses/${id}/presentations/${p.id}`}
                        className="hover:underline"
                      >
                        {p.title}
                      </Link>
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={p.status === 'published' ? 'success' : 'secondary'}>
                        {t(`presentations.status${p.status[0]!.toUpperCase()}${p.status.slice(1)}`)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {isGenerating && jobCreatedAt ? (
                    <GammaProgressBar createdAt={jobCreatedAt} />
                  ) : null}
                  <p className="line-clamp-2">{p.description ?? '—'}</p>
                  <p>{t('presentations.slidesCount', { count: p.slideCount })}</p>
                  {isGamma && (p.externalUrl || p.fileAssetId) ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {p.externalUrl ? (
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
                      ) : null}
                      {p.fileAssetId ? (
                        <DownloadPptxButton
                          fileAssetId={p.fileAssetId}
                          label={t('gamma.downloadPptx')}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    <ActionIconButton
                      asChild
                      icon={Pencil}
                      label={t('common.edit')}
                      color="yellow"
                    >
                      <Link to={`/teacher/courses/${id}/presentations/${p.id}`} />
                    </ActionIconButton>
                    {p.status !== 'published' ? (
                      <ActionIconButton
                        icon={CircleCheck}
                        label={t('presentations.publish')}
                        color="emerald"
                        onClick={async () => {
                          await transition.mutateAsync({ id: p.id, action: 'publish' });
                          toast.push({ title: t('presentations.published'), tone: 'success' });
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
                      onClick={async () => {
                        if (!confirm(t('presentations.deleteConfirm'))) return;
                        await del.mutateAsync(p.id);
                        toast.push({ title: t('presentations.deleted'), tone: 'success' });
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={t('presentations.createTitle')}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="p-title">{t('presentations.titleLabel')}</Label>
            <Input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="p-desc">{t('presentations.descriptionLabel')}</Label>
            <Input id="p-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Dialog>

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

    </div>
  );
}
