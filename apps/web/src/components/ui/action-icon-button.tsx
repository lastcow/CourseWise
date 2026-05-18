import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ActionIconColor =
  | 'amber'
  | 'orange'
  | 'sky'
  | 'teal'
  | 'emerald'
  | 'yellow'
  | 'red';

const COLOR_CLASSES: Record<ActionIconColor, string> = {
  amber:
    'border-amber-500/60 text-amber-500 hover:bg-amber-500/10 focus-visible:ring-amber-500/40',
  orange:
    'border-orange-500/60 text-orange-500 hover:bg-orange-500/10 focus-visible:ring-orange-500/40',
  sky: 'border-sky-500/60 text-sky-500 hover:bg-sky-500/10 focus-visible:ring-sky-500/40',
  teal: 'border-teal-500/60 text-teal-500 hover:bg-teal-500/10 focus-visible:ring-teal-500/40',
  emerald:
    'border-emerald-500/60 text-emerald-500 hover:bg-emerald-500/10 focus-visible:ring-emerald-500/40',
  yellow:
    'border-yellow-500/60 text-yellow-500 hover:bg-yellow-500/10 focus-visible:ring-yellow-500/40',
  red: 'border-red-500/60 text-red-500 hover:bg-red-500/10 focus-visible:ring-red-500/40',
};

const SIZE_BADGE: Record<'default' | 'sm', string> = {
  default: 'h-8 w-8',
  sm: 'h-7 w-7',
};

const SIZE_ICON: Record<'default' | 'sm', string> = {
  default: 'h-4 w-4',
  sm: 'h-3.5 w-3.5',
};

export interface ActionIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: LucideIcon;
  label: string;
  color: ActionIconColor;
  size?: 'default' | 'sm';
  asChild?: boolean;
}

export const ActionIconButton = React.forwardRef<HTMLButtonElement, ActionIconButtonProps>(
  function ActionIconButton(
    { icon: Icon, label, color, size = 'default', asChild = false, className, disabled, ...props },
    ref,
  ) {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : ((props.type as 'button' | 'submit' | 'reset' | undefined) ?? 'button')}
        aria-label={label}
        title={label}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-md border bg-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-50',
          SIZE_BADGE[size],
          COLOR_CLASSES[color],
          className,
        )}
        {...props}
      >
        <Icon className={SIZE_ICON[size]} aria-hidden />
      </Comp>
    );
  },
);
