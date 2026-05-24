import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';
import { Link, useMatch } from 'react-router-dom';
import { useMessageUnreadCount } from '@/lib/queries';
import { cn } from '@/lib/utils';

type Props = {
  /** Caller signals whether there's an authenticated session to gate the
   *  polling query — the layout knows its own auth state. */
  enabled: boolean;
};

/**
 * Envelope icon in the top nav. Polls /api/messages/unread-count every 60s
 * and shows a numeric badge when > 0. Click navigates to the messages page
 * of the currently active course (if any) or to /dashboard so the user can
 * pick one.
 */
export function MessageBell({ enabled }: Props): JSX.Element | null {
  const { t } = useTranslation();
  const teacherMatch = useMatch('/teacher/courses/:courseId/*');
  const studentMatch = useMatch('/student/courses/:courseId/*');
  const courseId = teacherMatch?.params.courseId ?? studentMatch?.params.courseId ?? null;
  // Default role for the link: teacher route if we're already there, else
  // student. When there's no active course we punt to /dashboard.
  const rolePrefix = teacherMatch ? '/teacher' : '/student';
  const href = courseId ? `${rolePrefix}/courses/${courseId}/messages` : '/dashboard';
  const q = useMessageUnreadCount(enabled);
  const total = q.data?.total ?? 0;
  const showBadge = total > 0;
  const label =
    total > 0
      ? t('messages.unreadBadgeLabel', { count: total })
      : t('messages.title');

  if (!enabled) return null;

  return (
    <Link
      to={href}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <Inbox className="h-4 w-4" aria-hidden />
      {showBadge ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
        >
          {total > 99 ? '99+' : total}
        </span>
      ) : null}
    </Link>
  );
}
