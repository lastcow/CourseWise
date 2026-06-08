import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Convert a stored UTC ISO timestamp into the value an
 * `<input type="datetime-local">` expects: the LOCAL wall-clock time as
 * "YYYY-MM-DDTHH:mm". Pairs with saving via `new Date(value).toISOString()`,
 * which reads the box back as local time and stores UTC. Using the naive
 * `new Date(iso).toISOString().slice(0, 16)` would instead show the UTC
 * wall-clock, so a teacher in (say) UTC-4 who entered 4:20 would re-open the
 * editor and see 8:20. This shifts by the timezone offset so the box shows the
 * teacher's own local time.
 */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
