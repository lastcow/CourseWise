import * as React from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const ActionMenuContext = React.createContext<{ close: () => void } | null>(null);

const TRIGGER_SIZE: Record<'default' | 'sm', string> = {
  default: 'h-8 w-8',
  sm: 'h-7 w-7',
};
const TRIGGER_ICON: Record<'default' | 'sm', string> = {
  default: 'h-4 w-4',
  sm: 'h-3.5 w-3.5',
};

type Coords = { top?: number; bottom?: number; left?: number; right?: number };

export interface ActionMenuProps {
  /** Accessible label / tooltip for the "…" trigger (e.g. "Actions"). */
  label: string;
  /** ActionMenuItem rows. */
  children: React.ReactNode;
  /** Which edge of the trigger the menu aligns to. Default 'end' (right). */
  align?: 'start' | 'end';
  size?: 'default' | 'sm';
  className?: string;
}

/**
 * A "…" overflow menu: a neutral ellipsis trigger that opens a small popover of
 * {@link ActionMenuItem} rows. The popover is portaled to <body> and positioned
 * against the trigger (fixed), so it escapes `overflow-hidden`/`overflow-auto`
 * ancestors like table containers. Outside-click, Esc, scroll, and resize all
 * dismiss; picking an item closes the menu. Dependency-free (no Radix).
 */
export function ActionMenu({
  label,
  children,
  align = 'end',
  size = 'default',
  className,
}: ActionMenuProps): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<Coords | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const close = React.useCallback(() => setOpen(false), []);

  // Measure the trigger and anchor the menu below it (or above when there isn't
  // room below). Coordinates are viewport-relative for `position: fixed`.
  const place = React.useCallback((): void => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const openUp = window.innerHeight - r.bottom < 220 && r.top > window.innerHeight / 2;
    setCoords({
      top: openUp ? undefined : Math.round(r.bottom + 4),
      bottom: openUp ? Math.round(window.innerHeight - r.top + 4) : undefined,
      left: align === 'start' ? Math.round(r.left) : undefined,
      right: align === 'end' ? Math.round(window.innerWidth - r.right) : undefined,
    });
  }, [align]);

  // Outside-click, Esc, scroll, and resize dismiss. The menu lives in a portal,
  // so the outside-click test checks the trigger AND the floating menu.
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
    // capture so a scroll in any ancestor (not just window) also dismisses
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
    <div className={cn('inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex items-center justify-center rounded-md border border-input bg-transparent text-muted-foreground transition-colors',
          'hover:bg-accent hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          open && 'bg-accent text-foreground',
          TRIGGER_SIZE[size],
        )}
      >
        <MoreHorizontal className={TRIGGER_ICON[size]} aria-hidden />
      </button>
      {open && coords
        ? createPortal(
            // bg-card (not bg-popover): the project's Tailwind config has no
            // popover token, so bg-popover would resolve transparent.
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: 'fixed',
                top: coords.top,
                bottom: coords.bottom,
                left: coords.left,
                right: coords.right,
              }}
              className="z-50 max-h-[20rem] min-w-[10rem] overflow-y-auto overflow-x-hidden rounded-md border bg-card text-card-foreground shadow-lg"
            >
              <ActionMenuContext.Provider value={{ close }}>
                <ul className="py-1">{children}</ul>
              </ActionMenuContext.Provider>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export interface ActionMenuItemProps {
  icon?: LucideIcon;
  children: React.ReactNode;
  /** Runs after the menu closes. May be async (the menu doesn't await it). */
  onSelect: () => void;
  /** 'destructive' tints the row + icon red (e.g. Delete). */
  tone?: 'default' | 'destructive';
  disabled?: boolean;
}

export function ActionMenuItem({
  icon: Icon,
  children,
  onSelect,
  tone = 'default',
  disabled = false,
}: ActionMenuItemProps): JSX.Element {
  const ctx = React.useContext(ActionMenuContext);
  return (
    <li>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => {
          ctx?.close();
          onSelect();
        }}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors',
          'hover:bg-accent focus:bg-accent focus:outline-none',
          'disabled:pointer-events-none disabled:opacity-50',
          tone === 'destructive' ? 'text-red-600 dark:text-red-400' : 'text-foreground',
        )}
      >
        {Icon ? (
          <Icon
            className={cn(
              'h-4 w-4 shrink-0',
              tone === 'destructive' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
            )}
            aria-hidden
          />
        ) : null}
        <span className="flex-1 truncate">{children}</span>
      </button>
    </li>
  );
}
