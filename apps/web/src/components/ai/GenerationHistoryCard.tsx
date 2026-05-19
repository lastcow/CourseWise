import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AiJobStatus, AiJobSummary } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCourseAiJob, useCourseAiJobs } from '@/lib/queries';
import { JobActivityTimeline } from './JobActivityTimeline';

type Props = { courseId: string };

function statusVariant(status: AiJobStatus): 'success' | 'destructive' | 'info' | 'secondary' | 'outline' {
  switch (status) {
    case 'succeeded': return 'success';
    case 'failed': return 'destructive';
    case 'partial': return 'outline';
    case 'running':
    case 'queued': return 'info';
    case 'canceled':
    default: return 'secondary';
  }
}

function formatCost(cents: number | null): string {
  if (cents == null || cents <= 0) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatWhen(j: AiJobSummary): string {
  const ts = j.finishedAt ?? j.startedAt ?? j.createdAt;
  return new Date(ts).toLocaleString();
}

function JobRow({ courseId, j }: { courseId: string; j: AiJobSummary }): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(j.status === 'running' || j.status === 'queued');
  const detailQ = useCourseAiJob(courseId, open ? j.id : null);

  return (
    <li className="rounded border bg-background">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Badge variant={statusVariant(j.status)}>{t(`ai.jobStatus.${j.status}`)}</Badge>
            <span className="truncate text-sm font-medium">{j.modelDisplayName}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {t('ai.history.progress', {
              succeeded: j.succeededCount,
              failed: j.failedCount,
              total: j.artifactCount,
            })}{' '}
            · {formatWhen(j)}
            {j.costCents != null && j.costCents > 0 ? ` · ${formatCost(j.costCents)}` : ''}
          </div>
        </div>
      </button>
      {open ? (
        <div className="px-3 pb-3">
          <JobActivityTimeline status={j.status} events={detailQ.data?.events ?? []} />
        </div>
      ) : null}
    </li>
  );
}

export function GenerationHistoryCard({ courseId }: Props): JSX.Element | null {
  const { t } = useTranslation();
  const jobsQ = useCourseAiJobs(courseId);
  const jobs = jobsQ.data ?? [];

  if (jobsQ.isLoading && jobs.length === 0) return null;
  if (!jobsQ.isLoading && jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('ai.history.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {jobs.map((j) => (
            <JobRow key={j.id} courseId={courseId} j={j} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
