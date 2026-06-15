import { useTranslation } from 'react-i18next';
import { CalendarOff } from 'lucide-react';
import { courseSubmissionsClosed, type CourseSummary } from '@coursewise/shared';
import { cn } from '@/lib/utils';

/**
 * Calm, professional banner shown to students on submission surfaces once a
 * course has ended and the submission lock is on. Renders nothing otherwise, so
 * callers can drop it in unconditionally. Uses the shared closed-check so what
 * the student sees matches the server's enforcement to the day.
 */
export function CourseEndedNotice({
  course,
  className,
}: {
  course: Pick<CourseSummary, 'endDate' | 'disableSubmissionsAfterEnd'> | null | undefined;
  className?: string;
}): JSX.Element | null {
  const { t } = useTranslation();
  if (!course || !courseSubmissionsClosed(course)) return null;
  const date = course.endDate
    ? new Date(course.endDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '';
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100',
        className,
      )}
    >
      <CalendarOff
        className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold">{t('courses.endedTitle')}</p>
        <p className="text-sm text-amber-800 dark:text-amber-200/90">
          {t('courses.endedBody', { date })}
        </p>
      </div>
    </div>
  );
}
