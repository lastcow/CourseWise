import * as React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type GradingNavStatus = 'needs' | 'graded' | 'inProgress' | 'returned' | 'other';

export interface GradingNavItem {
  id: string;
  title: string;
  subtitle?: string;
  status: GradingNavStatus;
  /** Localized status text for the badge. */
  statusLabel: string;
  /** e.g. "85 / 100". */
  score?: string | null;
}

const DOT: Record<GradingNavStatus, string> = {
  needs: 'bg-amber-400',
  graded: 'bg-emerald-500',
  inProgress: 'bg-slate-400',
  returned: 'bg-sky-400',
  other: 'bg-slate-400',
};

const STATUS_VARIANT: Record<GradingNavStatus, 'warning' | 'success' | 'secondary'> = {
  needs: 'warning',
  graded: 'success',
  inProgress: 'secondary',
  returned: 'secondary',
  other: 'secondary',
};

export interface GradingNavToolbarProps {
  search: string;
  onSearchChange: (next: string) => void;
  searchPlaceholder: string;
  /** "View requirements" / "View quiz" affordance at the start of the toolbar. */
  requirementsIcon: LucideIcon;
  requirementsLabel: string;
  onViewRequirements: () => void;
  requirementsDisabled?: boolean;
  /** Filtered + ordered roster the prev/next + dropdown traverse. */
  items: GradingNavItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Optional summary node (e.g. an "X to grade" badge) shown before the selector. */
  summary?: React.ReactNode;
}

type Coords = { top: number; right: number; minWidth: number };

/**
 * Top-of-page grading navigation: search + "view requirements" at the start, and
 * a `◀ [current · x/N ▾] ▶` student/group selector at the end. The dropdown
 * lists every (filtered) roster entry with its grade status; ◀/▶ step through the
 * same ordered list. Replaces the old left-hand roster sidebar. Self-contained
 * popover (portal + outside-click/Esc/scroll dismiss), no Radix.
 */
export function GradingNavToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  requirementsIcon: ReqIcon,
  requirementsLabel,
  onViewRequirements,
  requirementsDisabled,
  items,
  selectedId,
  onSelect,
  summary,
}: GradingNavToolbarProps): JSX.Element {
  const { t } = useTranslation();
  const idx = items.findIndex((it) => it.id === selectedId);
  const total = items.length;
  const current = idx >= 0 ? items[idx] : null;
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < total - 1;
  const go = (next: number): void => {
    const it = items[next];
    if (it) onSelect(it.id);
  };

  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<Coords | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const place = React.useCallback((): void => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setCoords({
      top: Math.round(r.bottom + 4),
      right: Math.round(window.innerWidth - r.right),
      minWidth: Math.round(Math.max(r.width, 256)),
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const dismiss = (): void => setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  const toggle = (): void => {
    if (open) {
      setOpen(false);
    } else {
      place();
      setOpen(true);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-2">
      {/* Start: search + requirements */}
      <Input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="h-8 w-56 min-w-0"
      />
      <ActionIconButton
        icon={ReqIcon}
        label={requirementsLabel}
        color="sky"
        onClick={onViewRequirements}
        disabled={requirementsDisabled}
      />

      {/* End: ◀ [selector] ▶ */}
      <div className="ml-auto flex items-center gap-1.5">
        {summary}
        <ActionIconButton
          icon={ChevronLeft}
          label={t('grading.nav.prev')}
          color="sky"
          onClick={() => go(idx - 1)}
          disabled={!canPrev}
        />
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          disabled={total === 0}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'inline-flex h-8 min-w-[12rem] max-w-[18rem] items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm transition-colors',
            'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:pointer-events-none disabled:opacity-50',
            open && 'bg-accent',
          )}
        >
          {current ? (
            <>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[current.status])} aria-hidden />
              <span className="truncate">{current.title}</span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                {idx + 1}/{total}
              </span>
            </>
          ) : (
            <span className="truncate text-muted-foreground">{t('grading.nav.pick')}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        <ActionIconButton
          icon={ChevronRight}
          label={t('grading.nav.next')}
          color="sky"
          onClick={() => go(idx + 1)}
          disabled={!canNext}
        />
      </div>

      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              style={{
                position: 'fixed',
                top: coords.top,
                right: coords.right,
                minWidth: coords.minWidth,
              }}
              className="z-50 max-h-[24rem] max-w-[24rem] overflow-y-auto overflow-x-hidden rounded-md border bg-card text-card-foreground shadow-lg"
            >
              <ul className="py-1">
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onSelect(it.id);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                        it.id === selectedId && 'bg-muted',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{it.title}</span>
                        {it.score || it.subtitle ? (
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {it.score ? <span className="font-mono">{it.score}</span> : null}
                            {it.subtitle ? <span>{it.subtitle}</span> : null}
                          </span>
                        ) : null}
                      </span>
                      <Badge variant={STATUS_VARIANT[it.status]} className="shrink-0">
                        {it.statusLabel}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
