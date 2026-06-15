import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional muted second line under the label (e.g. an email). Also searched. */
  description?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  /** Called with the chosen option's value. */
  onSelect: (value: string) => void;
  /** Trigger text shown when nothing is selected. */
  placeholder: string;
  /** Search-box placeholder. */
  searchPlaceholder: string;
  /** Shown when the search matches no option. */
  emptyText: string;
  /**
   * Currently-selected value for single-select display (shows the label in the
   * trigger and a check on the row). Omit entirely for an "add"-style picker
   * that always shows the placeholder and renders no check column.
   */
  value?: string | null;
  disabled?: boolean;
  /** Width/layout classes for the trigger wrapper (e.g. "max-w-sm"). */
  className?: string;
  /** Leading icon inside the trigger. */
  icon?: LucideIcon;
  /** Accessible label for the trigger (defaults to `placeholder`). */
  ariaLabel?: string;
}

type Coords = { top?: number; bottom?: number; left: number; minWidth: number };

/**
 * A professional, searchable single-select. The listbox is portaled to <body>
 * and fixed-positioned against the trigger, so it escapes `overflow` ancestors
 * (tables, cards). Type to filter; ArrowUp/Down move the highlight and Enter
 * selects; outside-click / Esc / resize / *ancestor* scroll dismiss (a scroll
 * inside the list does not, so the list stays scrollable). Dependency-free.
 *
 * Multiple instances can coexist on one page — option ids are namespaced with
 * `useId`, so this is safe inside a list (e.g. one per row).
 */
export function Combobox({
  options,
  onSelect,
  placeholder,
  searchPlaceholder,
  emptyText,
  value,
  disabled = false,
  className,
  icon: Icon,
  ariaLabel,
}: ComboboxProps): JSX.Element {
  const reactId = React.useId();
  const listboxId = `${reactId}-listbox`;
  const optId = (i: number): string => `${reactId}-opt-${i}`;
  // "Select" mode (a value prop was passed) reserves a check column; "add" mode
  // (no value prop) omits it for a cleaner action list.
  const showCheck = value !== undefined;

  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<Coords | null>(null);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selected = React.useMemo(
    () => (value != null ? (options.find((o) => o.value === value) ?? null) : null),
    [options, value],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || (o.description?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  // Viewport-relative coords for `position: fixed`; flip above when there isn't
  // room below. Match the trigger width as a sensible minimum.
  const place = React.useCallback((): void => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const openUp = window.innerHeight - r.bottom < 300 && r.top > window.innerHeight / 2;
    setCoords({
      top: openUp ? undefined : Math.round(r.bottom + 4),
      bottom: openUp ? Math.round(window.innerHeight - r.top + 4) : undefined,
      left: Math.round(r.left),
      minWidth: Math.round(r.width),
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
    // Capture-phase scroll fires for nested scrollers too; a scroll *inside* the
    // menu must not dismiss, or the option list can't be scrolled.
    const onScroll = (e: Event): void => {
      const target = e.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onResize = (): void => setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // Focus the search box on open; clear the query on close.
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
  }, [open]);

  // Keep the highlight in range as filtering shrinks the list…
  React.useEffect(() => {
    setActiveIndex((i) => (i > filtered.length - 1 ? 0 : i));
  }, [filtered.length]);

  // …and scrolled into view as it moves.
  React.useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-opt="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const toggle = (): void => {
    if (open) {
      setOpen(false);
    } else {
      setActiveIndex(0);
      place();
      setOpen(true);
    }
  };

  const pick = (val: string): void => {
    onSelect(val);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[Math.min(activeIndex, filtered.length - 1)];
      if (opt) pick(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          'inline-flex h-9 w-full items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm transition-colors',
          'hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !selected && 'text-muted-foreground',
        )}
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden /> : null}
        <span className={cn('flex-1 truncate text-left', selected && 'text-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && coords
        ? createPortal(
            // bg-card (not bg-popover): the project's Tailwind config has no
            // popover token, so bg-popover would resolve transparent.
            <div
              ref={menuRef}
              style={{
                position: 'fixed',
                top: coords.top,
                bottom: coords.bottom,
                left: coords.left,
                minWidth: coords.minWidth,
              }}
              className="z-50 flex max-h-[20rem] w-max max-w-[24rem] flex-col rounded-md border bg-card text-card-foreground shadow-lg"
            >
              <div className="flex items-center gap-1.5 border-b px-2.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onInputKeyDown}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={filtered.length > 0 ? listboxId : undefined}
                  aria-activedescendant={filtered.length > 0 ? optId(activeIndex) : undefined}
                  className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
              ) : (
                <ul id={listboxId} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
                  {filtered.map((o, i) => (
                    <li key={o.value}>
                      <button
                        type="button"
                        role="option"
                        id={optId(i)}
                        data-opt={i}
                        aria-selected={o.value === value}
                        onClick={() => pick(o.value)}
                        // onMouseMove (not onMouseEnter): keyboard nav can scroll a
                        // row under a resting cursor; only real movement should
                        // steal the highlight.
                        onMouseMove={() => setActiveIndex(i)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                          'focus:outline-none',
                          activeIndex === i ? 'bg-accent' : 'hover:bg-accent/60',
                          o.value === value && 'font-medium',
                        )}
                      >
                        {showCheck ? (
                          <Check
                            className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              o.value === value ? 'text-primary opacity-100' : 'opacity-0',
                            )}
                            aria-hidden
                          />
                        ) : null}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{o.label}</span>
                          {o.description ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {o.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
