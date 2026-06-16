import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';

/**
 * Blocking, unskippable modal with a spinning halo, shown while a view's data
 * loads. It has no close affordance by design (no "×", no backdrop dismiss,
 * and the underlying Dialog has no Esc handler) — the parent hides it by
 * passing `open={false}` once loading finishes. Mirrors PreparingGradesDialog.
 */
export function LoadingDialog({
  open,
  title,
  description,
  icon: Icon,
}: {
  open: boolean;
  /** Heading. Defaults to the shared "Loading…" string. */
  title?: string;
  /** Optional muted line under the heading. */
  description?: string;
  /** Optional glyph centered inside the spinning ring. */
  icon?: LucideIcon;
}): JSX.Element | null {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      dismissOnBackdropClick={false}
      hideCloseButton
      className="max-w-sm"
    >
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-5 py-2 text-center"
      >
        <span className="relative inline-flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary/10" aria-hidden />
          <span
            className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
            aria-hidden
          />
          {Icon ? <Icon className="relative h-7 w-7 text-primary" aria-hidden /> : null}
        </span>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title ?? t('common.loading')}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
    </Dialog>
  );
}
