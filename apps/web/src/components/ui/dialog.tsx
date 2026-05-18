import * as React from 'react';
import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, className }: DialogProps): JSX.Element | null {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        className={cn(
          'relative w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg',
          className,
        )}
      >
        {title ? <h2 className="mb-4 text-lg font-semibold">{title}</h2> : null}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-accent"
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
