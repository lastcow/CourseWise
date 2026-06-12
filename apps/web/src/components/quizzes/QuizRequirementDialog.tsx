import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  Hourglass,
  ListChecks,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { QuizSummary } from '@coursewise/shared';
import { Dialog } from '@/components/ui/dialog';
import { Markdown } from '@/components/ui/markdown';

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Read-only quiz viewer in a dialog: the key facts (total points, question
 * count, time limit), the availability timeline, and the full Markdown briefing.
 * Mirrors {@link AssignmentRequirementDialog} so teachers can re-read what a quiz
 * asks before grading attempts.
 */
export function QuizRequirementDialog({
  quiz: q,
  open,
  onClose,
}: {
  quiz: QuizSummary;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();

  const facts: { icon: LucideIcon; label: string; value: string }[] = [
    {
      icon: Trophy,
      label: t('quizzes.metaPoints'),
      value: q.maxScore != null ? String(q.maxScore) : '—',
    },
    {
      icon: ListChecks,
      label: t('quizzes.questionsTitle'),
      value: q.questionCount != null ? String(q.questionCount) : '—',
    },
    {
      icon: Hourglass,
      label: t('quizzes.timeLimitLabel'),
      value:
        q.timeLimitMinutes != null
          ? t('quizzes.metaMinutes', { minutes: q.timeLimitMinutes })
          : '—',
    },
  ];

  const stops = [
    q.startTime ? { label: t('quizzes.timelineOpens'), iso: q.startTime } : null,
    q.endTime ? { label: t('quizzes.timelineCloses'), iso: q.endTime } : null,
    q.untilDate ? { label: t('quizzes.timelineSubmitBy'), iso: q.untilDate } : null,
  ].filter(Boolean) as { label: string; iso: string }[];

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <div className="space-y-5">
        {/* Header band */}
        <div className="min-w-0 pr-8">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            {t('quizzes.detailsKicker')}
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold">{q.title}</h2>
        </div>

        {/* Fact tiles */}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {facts.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="rounded-md border bg-card p-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {f.label}
                </dt>
                <dd className="mt-1 truncate text-base font-semibold tabular-nums text-foreground">
                  {f.value}
                </dd>
              </div>
            );
          })}
        </dl>

        {/* Availability timeline */}
        {stops.length > 0 ? (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {t('quizzes.timelineHeading')}
            </div>
            <ul className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {stops.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"
                >
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatDateTime(s.iso)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* The briefing itself — full Markdown, read-only + scrollable. */}
        <div className="min-w-0">
          <div className="max-h-[45vh] overflow-y-auto rounded-md border bg-muted/30 p-4">
            {q.description ? (
              <Markdown source={q.description} />
            ) : (
              <p className="text-sm italic text-muted-foreground">{t('quizzes.noDescription')}</p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
