import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Inline loading state for the grading detail panel, shown while the selected
 * student's submission / quiz attempt is being fetched. Inline (not a blocking
 * modal) so the nav toolbar stays usable mid-load.
 */
export function GradingDetailLoading(): JSX.Element {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <p className="text-sm">{t('common.loading')}</p>
      </CardContent>
    </Card>
  );
}
