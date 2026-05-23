import { useEffect, useState } from 'react';

/**
 * Returns a `now` timestamp (ms since epoch) that re-renders the calling
 * component on a fixed interval, so any UI that filters by "the current
 * time" (e.g. "due in the next 30 days") stays fresh while the page is open.
 *
 * Pairs with TanStack Query's refetch-on-focus: the query layer pulls
 * fresh DATA on tab activation; this hook pulls a fresh CLOCK at a
 * cadence the consumer chooses.
 *
 * @param intervalMs how often to tick. Default 60_000 (1 minute).
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
