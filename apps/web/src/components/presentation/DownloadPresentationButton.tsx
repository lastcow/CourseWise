import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getDownloadUrl } from '@/lib/queries';
import { ApiClientError } from '@/lib/api';

type Props = {
  fileAssetId: string;
  /** Defaults to `presentations.downloadFile`. */
  labelKey?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'outline' | 'ghost' | 'default' | 'secondary';
  /** Render icon only (no label). Useful in dense rows like the modules list. */
  iconOnly?: boolean;
  /** Extra classes merged onto the button (e.g. to size it square in an actions column). */
  className?: string;
};

/**
 * Resolve a fresh presigned R2 URL for a presentation's file asset and
 * trigger the browser to download it. Shared by the Presentations table
 * and the Modules pages so any presentation backed by an uploaded file
 * (regardless of provider: Gamma .pptx or teacher upload) gets the same
 * Download affordance.
 */
export function DownloadPresentationButton({
  fileAssetId,
  labelKey = 'presentations.downloadFile',
  size = 'sm',
  variant = 'outline',
  iconOnly = false,
  className,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const label = t(labelKey);

  async function onClick(): Promise<void> {
    setBusy(true);
    try {
      const res = await getDownloadUrl(fileAssetId);
      window.location.href = res.downloadUrl;
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size={size}
      variant={variant}
      disabled={busy}
      onClick={onClick}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={className}
    >
      <Download className="h-4 w-4" />
      {iconOnly ? null : label}
    </Button>
  );
}
