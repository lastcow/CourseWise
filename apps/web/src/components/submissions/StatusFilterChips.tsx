import { cn } from '@/lib/utils';
import type { ChipTone, StatusChip } from './statusFilter';

// Flat / outlined chips: a colored border + colored text on a transparent fill
// when idle; a faint same-color tint + ring when selected. Colors mirror the
// row status badges so the filter reads as the same vocabulary.
const TONE: Record<ChipTone, { idle: string; active: string }> = {
  emerald: {
    idle: 'border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30',
    active:
      'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  amber: {
    idle: 'border-amber-500/40 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30',
    active:
      'border-amber-500 bg-amber-50 text-amber-800 ring-1 ring-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300',
  },
  sky: {
    idle: 'border-sky-500/40 text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/30',
    active:
      'border-sky-500 bg-sky-50 text-sky-800 ring-1 ring-sky-500/40 dark:bg-sky-950/40 dark:text-sky-300',
  },
  slate: {
    idle: 'border-slate-400/50 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/40',
    active:
      'border-slate-500 bg-slate-100 text-slate-800 ring-1 ring-slate-400/50 dark:bg-slate-800/60 dark:text-slate-200',
  },
  rose: {
    idle: 'border-rose-500/40 text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30',
    active:
      'border-rose-500 bg-rose-50 text-rose-800 ring-1 ring-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300',
  },
};

/**
 * A flat row of rectangular status chips for a submissions/attempts roster.
 * Each chip is outlined in its status color and shows a count; this is a
 * single-select control (one status at a time, or none = show all) — clicking
 * the active chip clears it. Renders nothing when there are no statuses.
 */
export function StatusFilterChips({
  chips,
  value,
  onChange,
}: {
  chips: StatusChip[];
  value: string | null;
  onChange: (key: string | null) => void;
}): JSX.Element | null {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => {
        const active = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : c.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border bg-transparent px-2.5 py-0.5 text-xs font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? TONE[c.tone].active : TONE[c.tone].idle,
            )}
          >
            <span>{c.label}</span>
            <span className="tabular-nums opacity-70">{c.count}</span>
          </button>
        );
      })}
    </div>
  );
}
