import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';

/**
 * Blocking, unskippable modal shown while the gradebook recomputes final grades
 * on open (compute-on-read). It has no close affordance by design — the parent
 * hides it by passing `open={false}` once the grades have finished loading.
 */
export function PreparingGradesDialog({ open }: { open: boolean }): JSX.Element | null {
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
        {/* Haloed cap with a spinning accent ring — on-brand for the gradebook. */}
        <span className="relative inline-flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary/10" aria-hidden />
          <span
            className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
            aria-hidden
          />
          <GraduationCap className="relative h-7 w-7 text-primary" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t('grading.preparingTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('grading.preparingBody')}</p>
        </div>
      </div>
    </Dialog>
  );
}
