import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * When false, clicks on the backdrop do not dismiss the dialog.
   * Use for dialogs that contain unsaved edits, so the user has to
   * make a deliberate Save / Close choice. Default true.
   */
  dismissOnBackdropClick?: boolean;
  /**
   * Suppresses the corner "×" close button. Pair with
   * dismissOnBackdropClick={false} for truly unskippable dialogs
   * (FERPA acknowledgment, session-expired, etc.) where the user
   * MUST pick one of the in-content actions.
   */
  hideCloseButton?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  dismissOnBackdropClick = true,
  hideCloseButton = false,
}: DialogProps): JSX.Element | null {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={dismissOnBackdropClick ? onClose : undefined}
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
        {hideCloseButton ? null : (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-accent"
            aria-label={t('common.close')}
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
