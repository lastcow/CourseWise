import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, Circle, CircleCheck, Lock, RefreshCw } from 'lucide-react';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { stripMarkdown } from '@/components/ui/markdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAssignmentsList, useModulesList } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { AssignmentSummary, SubmissionStatus } from '@coursewise/shared';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() > new Date(iso).getTime();
}

/**
 * Mirrors the StatusIcon used on the teacher Assignments page so both views
 * share the same visual vocabulary for assignment lifecycle state.
 */
function AssignmentStatusIcon({ status }: { status: AssignmentSummary['status'] }): JSX.Element {
  const { t } = useTranslation();
  const label = t(`assignments.status${status[0]!.toUpperCase()}${status.slice(1)}`);
  const { Icon, tone } = (() => {
    switch (status) {
      case 'published':
        return { Icon: CircleCheck, tone: 'border-emerald-500/60 text-emerald-500' };
      case 'closed':
        return { Icon: Lock, tone: 'border-sky-500/60 text-sky-500' };
      case 'archived':
        return { Icon: Archive, tone: 'border-orange-500/60 text-orange-500' };
      default:
        return { Icon: Circle, tone: 'border-slate-400/60 text-slate-400' };
    }
  })();
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

function submissionVariant(s: SubmissionStatus): 'success' | 'destructive' | 'secondary' {
  if (s === 'graded' || s === 'submitted') return 'success';
  if (s === 'late' || s === 'returned') return 'destructive';
  return 'secondary';
}

export function StudentAssignmentsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useAssignmentsList(id);
  const modulesQ = useModulesList(id || null);

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('assignments.title')}</h2>
      </header>

      <div className="overflow-hidden rounded-md border">
        {/* Toolbar — refresh only; students have no create / mutate actions
            on the list page (they act from the detail page). */}
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
            {t('assignments.emptyStudent')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('assignments.colTitle')}</TableHead>
                <TableHead>{t('assignments.colDescription')}</TableHead>
                <TableHead>{t('assignments.colModule')}</TableHead>
                <TableHead>{t('assignments.colDue')}</TableHead>
                <TableHead className="text-right">{t('assignments.colMaxScore')}</TableHead>
                <TableHead>{t('assignments.colMyStatus')}</TableHead>
                <TableHead className="text-right">{t('assignments.colMyGrade')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((a) => {
                const mine = a.mySubmission ?? null;
                // The POST /submissions call creates a 'draft' row on first
                // view; we don't treat that as having submitted. Only rows
                // that the student has actually sent flip the My status
                // column to a non-default badge.
                const hasSubmitted = mine && mine.status !== 'draft';
                const overdue = isOverdue(a.dueDate) && a.status !== 'closed' && !hasSubmitted;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <AssignmentStatusIcon status={a.status} />
                        <Link
                          to={`/student/courses/${id}/assignments/${a.id}`}
                          className="hover:underline"
                        >
                          {a.title}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[24ch] text-muted-foreground">
                      <span className="line-clamp-1">
                        {a.description ? stripMarkdown(a.description) : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={a.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                        {a.moduleId ? (moduleTitleById.get(a.moduleId) ?? '—') : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(a.dueDate)}
                      {overdue ? (
                        <span className="ml-2 text-destructive">{t('assignments.overdue')}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.maxScore ?? '—'}</TableCell>
                    <TableCell>
                      {hasSubmitted ? (
                        <Badge variant={submissionVariant(mine!.status)}>
                          {t(
                            `submissions.status${mine!.status[0]!.toUpperCase()}${mine!.status.slice(1)}`,
                          )}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {mine?.score != null ? mine.score : '—'}
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
