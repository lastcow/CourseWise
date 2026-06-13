import * as React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GroupFilterGroup {
  id: string;
  name: string;
  /** Students in this group within the current roster. */
  count: number;
}

export interface GroupFilterSection {
  setId: string;
  setName: string;
  groups: GroupFilterGroup[];
}

interface GroupFilterMenuProps {
  sections: GroupFilterSection[];
  /** Selected groupId, or null for "all groups". */
  value: string | null;
  onChange: (groupId: string | null) => void;
  /** Render a set-name header above each section (true when >1 group set). */
  showSectionHeaders: boolean;
}

type Coords = { top?: number; bottom?: number; left: number; minWidth: number };

type RenderItem =
  | { kind: 'header'; key: string; setName: string }
  | { kind: 'all'; optIndex: number }
  | { kind: 'group'; optIndex: number; group: GroupFilterGroup };

/**
 * Filter-by-group control for the gradebook toolbar: a labelled trigger (shows
 * the active group, or a placeholder) that opens a portaled, searchable popover
 * of groups. When the course has more than one group set the groups are split
 * into set-titled sections. Type to filter; ArrowUp/Down move the highlight and
 * Enter selects. Portaled to <body> + fixed-positioned so it escapes the table's
 * `overflow` ancestors; outside-click / Esc / resize / *ancestor* scroll dismiss
 * (a scroll inside the list does not, so the list stays scrollable).
 */
export function GroupFilterMenu({
  sections,
  value,
  onChange,
  showSectionHeaders,
}: GroupFilterMenuProps): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<Coords | null>(null);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selected = React.useMemo(() => {
    for (const s of sections) {
      const g = s.groups.find((x) => x.id === value);
      if (g) return g;
    }
    return null;
  }, [sections, value]);

  // Groups whose name (or whose parent set name) matches the search box.
  const visibleSections = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({
        ...s,
        groups: s.setName.toLowerCase().includes(q)
          ? s.groups
          : s.groups.filter((g) => g.name.toLowerCase().includes(q)),
      }))
      .filter((s) => s.groups.length > 0);
  }, [sections, query]);

  // The selectable options in visual order — Enter / arrow keys index into this.
  // "All groups" leads only when not searching.
  const optionIds = React.useMemo(() => {
    const ids: (string | null)[] = [];
    if (!query.trim()) ids.push(null);
    for (const s of visibleSections) for (const g of s.groups) ids.push(g.id);
    return ids;
  }, [visibleSections, query]);

  const renderItems = React.useMemo(() => {
    const items: RenderItem[] = [];
    let optIndex = 0;
    if (!query.trim()) {
      items.push({ kind: 'all', optIndex });
      optIndex++;
    }
    for (const s of visibleSections) {
      if (showSectionHeaders) items.push({ kind: 'header', key: s.setId, setName: s.setName });
      for (const g of s.groups) {
        items.push({ kind: 'group', optIndex, group: g });
        optIndex++;
      }
    }
    return items;
  }, [visibleSections, query, showSectionHeaders]);

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
    setActiveIndex((i) => (i > optionIds.length - 1 ? 0 : i));
  }, [optionIds.length]);

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

  const pick = (id: string | null): void => {
    onChange(id);
    setOpen(false);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(optionIds.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (optionIds.length > 0) {
        pick(optionIds[Math.min(activeIndex, optionIds.length - 1)] ?? null);
        triggerRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const active = value !== null;

  return (
    <div className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('grading.filterByGroup')}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active
            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/40'
            : 'border-input bg-background text-muted-foreground hover:bg-muted',
        )}
      >
        <Users className="h-4 w-4 shrink-0" aria-hidden />
        <span className={cn('max-w-[10rem] truncate', active && 'font-medium')}>
          {selected ? selected.name : t('grading.filterByGroup')}
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
              className="z-50 flex max-h-[20rem] w-max max-w-[20rem] flex-col rounded-md border bg-card text-card-foreground shadow-lg"
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
                  placeholder={t('grading.filterGroupSearch')}
                  aria-label={t('grading.filterGroupSearch')}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={optionIds.length > 0 ? 'gfm-listbox' : undefined}
                  aria-activedescendant={
                    optionIds.length > 0 ? `gfm-opt-${activeIndex}` : undefined
                  }
                  className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              {optionIds.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('grading.filterGroupNoMatch')}
                </div>
              ) : (
                <ul id="gfm-listbox" role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
                  {renderItems.map((it) => {
                    if (it.kind === 'header') {
                      return (
                        <li
                          key={`h-${it.key}`}
                          role="presentation"
                          className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                        >
                          {it.setName}
                        </li>
                      );
                    }
                    if (it.kind === 'all') {
                      return (
                        <GroupRow
                          key="all"
                          optIndex={it.optIndex}
                          active={activeIndex === it.optIndex}
                          selected={value === null}
                          label={t('grading.filterAllGroups')}
                          onPick={() => pick(null)}
                          onHover={() => setActiveIndex(it.optIndex)}
                        />
                      );
                    }
                    return (
                      <GroupRow
                        key={it.group.id}
                        optIndex={it.optIndex}
                        active={activeIndex === it.optIndex}
                        selected={it.group.id === value}
                        label={it.group.name}
                        count={it.group.count}
                        onPick={() => pick(it.group.id)}
                        onHover={() => setActiveIndex(it.optIndex)}
                      />
                    );
                  })}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function GroupRow({
  optIndex,
  label,
  count,
  selected,
  active,
  onPick,
  onHover,
}: {
  optIndex: number;
  label: string;
  count?: number;
  selected: boolean;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        role="option"
        id={`gfm-opt-${optIndex}`}
        data-opt={optIndex}
        aria-selected={selected}
        onClick={onPick}
        // onMouseMove (not onMouseEnter): keyboard nav can scroll a row under a
        // resting cursor; only real movement should steal the highlight.
        onMouseMove={onHover}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
          'focus:outline-none',
          active ? 'bg-accent' : 'hover:bg-accent/60',
          selected && 'font-medium',
        )}
      >
        <Check
          className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-primary opacity-100' : 'opacity-0')}
          aria-hidden
        />
        <span className="flex-1 truncate">{label}</span>
        {count !== undefined ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </button>
    </li>
  );
}
