import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LoadingDialog } from '@/components/ui/loading-dialog';

/**
 * Blocking, unskippable modal shown while the gradebook recomputes final grades
 * on open (compute-on-read). A thin gradebook-flavored wrapper over the shared
 * {@link LoadingDialog} — it pins the graduation-cap glyph and the grading copy;
 * the parent hides it by passing `open={false}` once the grades have loaded.
 */
export function PreparingGradesDialog({ open }: { open: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  return (
    <LoadingDialog
      open={open}
      icon={GraduationCap}
      title={t('grading.preparingTitle')}
      description={t('grading.preparingBody')}
    />
  );
}
