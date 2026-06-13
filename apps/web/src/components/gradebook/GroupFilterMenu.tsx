import * as React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Users } from 'lucide-react';
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

/**
 * Filter-by-group control for the gradebook toolbar: a labelled trigger (shows
 * the active group, or a placeholder) that opens a portaled popover of groups.
 * When the course has more than one group set the groups are split into
 * set-titled sections. Portaled to <body> + fixed-positioned so it escapes the
 * table's `overflow` ancestors; outside-click / Esc / scroll / resize dismiss.
 * Dependency-free, matching {@link ActionMenu}.
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
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const selected = React.useMemo(() => {
    for (const s of sections) {
      const g = s.groups.find((x) => x.id === value);
      if (g) return g;
    }
    return null;
  }, [sections, value]);

  // Viewport-relative coords for `position: fixed`; flip above when there isn't
  // room below. Match the trigger width as a sensible minimum.
  const place = React.useCallback((): void => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const openUp = window.innerHeight - r.bottom < 280 && r.top > window.innerHeight / 2;
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

  const pick = (id: string | null): void => {
    onChange(id);
    setOpen(false);
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
              role="listbox"
              style={{
                position: 'fixed',
                top: coords.top,
                bottom: coords.bottom,
                left: coords.left,
                minWidth: coords.minWidth,
              }}
              className="z-50 max-h-[20rem] w-max max-w-[18rem] overflow-y-auto overflow-x-hidden rounded-md border bg-card text-card-foreground shadow-lg"
            >
              <ul className="py-1">
                <GroupRow
                  label={t('grading.filterAllGroups')}
                  selected={value === null}
                  onClick={() => pick(null)}
                />
                {sections.map((s) => (
                  <li key={s.setId}>
                    {showSectionHeaders ? (
                      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {s.setName}
                      </div>
                    ) : null}
                    <ul>
                      {s.groups.map((g) => (
                        <GroupRow
                          key={g.id}
                          label={g.name}
                          count={g.count}
                          selected={g.id === value}
                          onClick={() => pick(g.id)}
                        />
                      ))}
                    </ul>
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

function GroupRow({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
          'hover:bg-accent focus:bg-accent focus:outline-none',
          selected && 'bg-accent/60 font-medium',
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
