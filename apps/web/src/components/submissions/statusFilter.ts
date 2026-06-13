export type ChipTone = 'emerald' | 'amber' | 'sky' | 'slate' | 'rose';

export interface StatusDef {
  key: string;
  tone: ChipTone;
}

export interface StatusChip extends StatusDef {
  label: string;
  count: number;
}

/**
 * Build status-filter chips for the statuses actually present in `items`,
 * preserving the canonical order in `defs`. Counts are over all items
 * (search-independent), so the chip set stays stable as the roster is
 * searched/paginated.
 */
export function statusChips<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  defs: readonly StatusDef[],
  label: (key: string) => string,
): StatusChip[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const k = getKey(it);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return defs
    .filter((d) => counts.has(d.key))
    .map((d) => ({ ...d, label: label(d.key), count: counts.get(d.key) ?? 0 }));
}
