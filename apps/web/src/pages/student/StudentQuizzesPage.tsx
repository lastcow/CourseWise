import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, Circle, CircleCheck, Lock, Play, RefreshCw } from 'lucide-react';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { stripMarkdown } from '@/components/ui/markdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useModulesList, useQuizzesList } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { QuizSummary } from '@coursewise/shared';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  return `${formatDate(start)} → ${formatDate(end)}`;
}

/**
 * Same visual vocabulary as the teacher Quizzes page so both views read
 * as the same screen with role-specific actions.
 */
function StatusIcon({ status }: { status: QuizSummary['status'] }): JSX.Element {
  const { t } = useTranslation();
  const label = t(`quizzes.status${status[0]!.toUpperCase()}${status.slice(1)}`);
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

/**
 * Outlined-badge action that doubles as the "take quiz" link. Disabled
 * (muted border + cursor-not-allowed) when the quiz is unpublished or
 * outside its [startTime, endTime] window, so the student understands
 * the action is gated rather than discovering it via a 409 from the API.
 */
function StartQuizBadge({
  cid,
  quiz,
  label,
  tNotAvailable,
  tOpensOn,
  tClosesOn,
}: {
  cid: string;
  quiz: QuizSummary;
  label: string;
  tNotAvailable: string;
  tOpensOn: (iso: string) => string;
  tClosesOn: (iso: string) => string;
}): JSX.Element {
  const baseClass =
    'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors';
  if (quiz.status !== 'published') {
    return (
      <span
        title={tNotAvailable}
        className={cn(
          baseClass,
          'cursor-not-allowed border-input bg-muted/30 text-muted-foreground opacity-60',
        )}
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
    );
  }
  const now = Date.now();
  const notYetOpen = quiz.startTime != null && now < Date.parse(quiz.startTime);
  const windowClosed = quiz.endTime != null && now >= Date.parse(quiz.endTime);
  if (notYetOpen || windowClosed) {
    const reason = notYetOpen ? tOpensOn(quiz.startTime!) : tClosesOn(quiz.endTime!);
    return (
      <span
        title={reason}
        className={cn(
          baseClass,
          'cursor-not-allowed border-input bg-muted/30 text-muted-foreground opacity-60',
        )}
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <Link
      to={`/student/courses/${cid}/quizzes/${quiz.id}`}
      className={cn(
        baseClass,
        'border-emerald-500/60 text-emerald-600 hover:bg-emerald-500/10',
      )}
    >
      <Play className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}

export function StudentQuizzesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const list = useQuizzesList(cid);
  const modulesQ = useModulesList(cid || null);

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('quizzes.title')}</h2>
      </header>

      <div className="overflow-hidden rounded-md border">
        {/* Toolbar — students get refresh only; the take-quiz action lives
            in each row, not at the top. */}
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
            {t('quizzes.studentEmpty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('quizzes.colTitle')}</TableHead>
                <TableHead>{t('quizzes.colDescription')}</TableHead>
                <TableHead>{t('quizzes.colModule')}</TableHead>
                <TableHead className="text-right">{t('quizzes.colQuestions')}</TableHead>
                <TableHead>{t('quizzes.colWindow')}</TableHead>
                <TableHead className="text-right">{t('quizzes.colTimeLimit')}</TableHead>
                <TableHead className="text-right">{t('quizzes.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={q.status} />
                      <Link
                        to={`/student/courses/${cid}/quizzes/${q.id}`}
                        className="hover:underline"
                      >
                        {q.title}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[24ch] text-muted-foreground">
                    <span className="line-clamp-1">
                      {q.description ? stripMarkdown(q.description) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={q.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                      {q.moduleId ? (moduleTitleById.get(q.moduleId) ?? '—') : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {q.questionCount ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatWindow(q.startTime, q.endTime)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {q.timeLimitMinutes ? `${q.timeLimitMinutes} min` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <StartQuizBadge
                      cid={cid}
                      quiz={q}
                      label={t('quizzes.takeQuiz')}
                      tNotAvailable={t('quizzes.notAvailable')}
                      tOpensOn={(d) =>
                        t('assignments.opensOn', { date: new Date(d).toLocaleString() })
                      }
                      tClosesOn={(d) =>
                        t('assignments.closesOn', { date: new Date(d).toLocaleString() })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
