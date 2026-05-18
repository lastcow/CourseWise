import * as React from 'react';
import { cn } from '@/lib/utils';

const tone: Record<string, string> = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border border-input text-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  success: 'bg-emerald-100 text-emerald-900',
  warning: 'bg-amber-100 text-amber-900',
  info: 'bg-sky-100 text-sky-900',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof tone;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone[variant],
        className,
      )}
      {...props}
    />
  );
}
