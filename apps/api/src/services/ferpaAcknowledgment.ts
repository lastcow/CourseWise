/**
 * Returns the current academic-year label as "YYYY-YYYY" with a July 1
 * rollover (US K-12 / common university convention).
 *
 *   2026-05-21 → "2025-2026"   (still in the 2025–26 academic year)
 *   2026-07-01 → "2026-2027"   (rolls over to 2026–27)
 *
 * Exposed for unit testing — the route handler picks `now = new Date()`.
 */
export function currentAcademicYear(now: Date): string {
  // toISOString() is UTC; that's fine — we just need a stable, monotonic
  // boundary. Schools in non-UTC timezones can mis-fire by a few hours
  // around July 1, which doesn't matter for a yearly acknowledgment.
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12
  // Months Jan–Jun belong to the academic year that started the prior July.
  const start = month >= 7 ? year : year - 1;
  return `${start}-${start + 1}`;
}
