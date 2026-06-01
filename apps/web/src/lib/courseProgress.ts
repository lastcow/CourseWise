/**
 * Time-based course progress: how far "now" has advanced through the course's
 * scheduled window [startDate, endDate]. Returns a 0–100 percentage, or null
 * when there's nothing meaningful to show (either date missing, unparseable,
 * or a non-positive window). Before the start it's 0; after the end it's 100.
 *
 * `now` is injectable so the value is deterministic in tests.
 */
export function courseTimeProgress(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!startDate || !endDate) return null;
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const pct = ((now - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, pct));
}
