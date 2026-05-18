import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type AccordionContextValue = {
  isOpen: (value: string) => boolean;
  toggle: (value: string) => void;
};

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

function useAccordion(): AccordionContextValue {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) throw new Error('Accordion subcomponents must be used inside <Accordion>');
  return ctx;
}

type AccordionProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Controlled set of open item values. */
  value?: string[];
  /** Uncontrolled initial open values. */
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** When true, only one item may be open at a time. */
  single?: boolean;
};

export function Accordion({
  value,
  defaultValue,
  onValueChange,
  single = false,
  className,
  children,
  ...props
}: AccordionProps): JSX.Element {
  const [internal, setInternal] = React.useState<string[]>(defaultValue ?? []);
  const controlled = value !== undefined;
  const open = controlled ? value : internal;

  const setOpen = React.useCallback(
    (next: string[]) => {
      if (!controlled) setInternal(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );

  const ctx = React.useMemo<AccordionContextValue>(
    () => ({
      isOpen: (v) => open.includes(v),
      toggle: (v) => {
        if (open.includes(v)) {
          setOpen(open.filter((x) => x !== v));
        } else {
          setOpen(single ? [v] : [...open, v]);
        }
      },
    }),
    [open, setOpen, single],
  );

  return (
    <AccordionContext.Provider value={ctx}>
      <div className={cn('space-y-2', className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

type AccordionItemContextValue = { value: string };
const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null);

function useItem(): AccordionItemContextValue {
  const ctx = React.useContext(AccordionItemContext);
  if (!ctx) throw new Error('AccordionTrigger/Content must be used inside <AccordionItem>');
  return ctx;
}

type AccordionItemProps = React.HTMLAttributes<HTMLDivElement> & { value: string };

export function AccordionItem({
  value,
  className,
  children,
  ...props
}: AccordionItemProps): JSX.Element {
  return (
    <AccordionItemContext.Provider value={{ value }}>
      <div
        className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
        {...props}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

type AccordionTriggerProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: React.ReactNode;
  /** Extra content rendered next to the chevron, outside the toggle button. */
  trailing?: React.ReactNode;
};

/**
 * Renders the header row: a button wrapping `children` plus an optional
 * `trailing` slot for action buttons that must NOT toggle the panel.
 */
export function AccordionTrigger({
  children,
  trailing,
  className,
  ...props
}: AccordionTriggerProps): JSX.Element {
  const { value } = useItem();
  const { isOpen, toggle } = useAccordion();
  const open = isOpen(value);
  return (
    <div className="flex items-center gap-2 p-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => toggle(value)}
        className={cn(
          'flex flex-1 items-center gap-2 rounded text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        {...props}
      >
        <ChevronDown
          className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
        <div className="flex-1">{children}</div>
      </button>
      {trailing ? <div className="flex items-center gap-1.5">{trailing}</div> : null}
    </div>
  );
}

type AccordionContentProps = React.HTMLAttributes<HTMLDivElement>;

export function AccordionContent({
  className,
  children,
  ...props
}: AccordionContentProps): JSX.Element | null {
  const { value } = useItem();
  const { isOpen } = useAccordion();
  if (!isOpen(value)) return null;
  return (
    <div className={cn('border-t px-3 pb-3 pt-3', className)} {...props}>
      {children}
    </div>
  );
}
