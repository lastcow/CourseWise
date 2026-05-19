import { useTranslation } from 'react-i18next';
import type { AiJobStatus, AiJobSummary } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCourseAiJobs } from '@/lib/queries';

type Props = { courseId: string };

function statusVariant(status: AiJobStatus): 'success' | 'destructive' | 'info' | 'secondary' | 'outline' {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'partial':
      return 'outline';
    case 'running':
    case 'queued':
      return 'info';
    case 'canceled':
    default:
      return 'secondary';
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
            <li
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
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
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
