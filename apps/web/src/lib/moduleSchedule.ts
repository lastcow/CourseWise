import type { ModuleSummary } from '@coursewise/shared';

/** Past its window or manually closed — grays out but stays functional. */
export function moduleClosed(m: ModuleSummary): boolean {
  return !!m.closedAt || (!!m.endAt && new Date(m.endAt).getTime() < Date.now());
}

/** "Mon, Jun 1, 1:00 – 2:00 PM" for session windows, "Jun 1 – Jun 7" for
 *  period windows. Times render in UTC — windows are stored as the wall-clock
 *  times the teacher entered. */
export function formatModuleWindow(m: ModuleSummary): string | null {
  if (!m.startAt || !m.endAt) return null;
  const start = new Date(m.startAt);
  const end = new Date(m.endAt);
  if (m.startAt.slice(0, 10) === m.endAt.slice(0, 10)) {
    const day = start.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    const until = end.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    return `${day} – ${until}`;
  }
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const;
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}
