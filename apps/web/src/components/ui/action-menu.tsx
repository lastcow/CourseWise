import * as React from 'react';
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
 * {@link ActionMenuItem} rows. Outside-click and Esc dismiss; picking an item
 * closes the menu. Built in the same lightweight, dependency-free style as
 * LanguageSwitcher (no Radix) so it can live inside an accordion header etc.
 */
export function ActionMenu({
  label,
  children,
  align = 'end',
  size = 'default',
  className,
}: ActionMenuProps): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape close the menu. Listeners are mounted only while
  // open; the opening click happened before they attach, so it won't self-close.
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
      {open ? (
        // bg-card (not bg-popover): the project's Tailwind config has no popover
        // token, so bg-popover would resolve transparent — matches LanguageSwitcher.
        <div
          role="menu"
          className={cn(
            'absolute top-full z-40 mt-1 min-w-[10rem] overflow-hidden rounded-md border bg-card text-card-foreground shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          <ActionMenuContext.Provider value={{ close }}>
            <ul className="py-1">{children}</ul>
          </ActionMenuContext.Provider>
        </div>
      ) : null}
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
