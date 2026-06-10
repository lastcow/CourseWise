import type { AlertType } from '@coursewise/shared';

// Color-coded outline tone per alert type so chip rows and per-row type
// badges read the same everywhere alerts appear.
export const TYPE_TONE: Record<AlertType, string> = {
  attendance_low: 'border-amber-500/60 text-amber-700 dark:text-amber-300',
  consecutive_absences: 'border-red-500/60 text-red-700 dark:text-red-300',
  late_submissions: 'border-orange-500/60 text-orange-700 dark:text-orange-300',
  quiz_average_low: 'border-yellow-500/60 text-yellow-700 dark:text-yellow-300',
  inactivity: 'border-sky-500/60 text-sky-700 dark:text-sky-300',
  manual: 'border-muted-foreground/40 text-muted-foreground',
  quiz_schedule_open: 'border-emerald-500/60 text-emerald-700 dark:text-emerald-300',
};

export const TYPE_ACTIVE: Record<AlertType, string> = {
  attendance_low: 'bg-amber-500/10',
  consecutive_absences: 'bg-red-500/10',
  late_submissions: 'bg-orange-500/10',
  quiz_average_low: 'bg-yellow-500/10',
  inactivity: 'bg-sky-500/10',
  manual: 'bg-muted',
  quiz_schedule_open: 'bg-emerald-500/10',
};
