import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useTogglePresentationShare } from '@/lib/queries';

type Props = {
  open: boolean;
  onClose: () => void;
  courseId: string;
  presentationId: string;
  initialEnabled: boolean;
  initialToken: string | null;
};

function shareUrlForToken(token: string | null): string {
  if (!token) return '';
  return `${window.location.origin}/p/${token}`;
}

export function ShareLinkDialog({
  open,
  onClose,
  courseId,
  presentationId,
  initialEnabled,
  initialToken,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const toggle = useTogglePresentationShare(courseId);
  // Local mirror of the toggle's authoritative state — we hand the mutation a
  // boolean and reflect what the server returns. We avoid making the toggle
  // optimistic because minting a token requires a round-trip.
  const [enabled, setEnabled] = useState(initialEnabled);
  const [token, setToken] = useState<string | null>(initialToken);

  const url = shareUrlForToken(token);

  const onChange = async (next: boolean) => {
    try {
      const result = await toggle.mutateAsync({ id: presentationId, enabled: next });
      setEnabled(result.shareEnabled);
      setToken(result.shareToken);
      toast.push({
        title: next ? t('gamma.share.enabledToast') : t('gamma.share.disabledToast'),
        tone: 'success',
      });
    } catch {
      toast.push({ title: t('common.error'), tone: 'error' });
    }
  };

  const onCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.push({ title: t('gamma.share.copied'), tone: 'success' });
    } catch {
      toast.push({ title: t('common.error'), tone: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('gamma.share.dialogTitle')}>
      <div className="space-y-4">
        <label className="flex items-center gap-3 rounded border bg-background px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => void onChange(e.target.checked)}
            disabled={toggle.isPending}
          />
          <span>{t('gamma.share.enable')}</span>
        </label>

        <p className="text-xs text-muted-foreground">
          {enabled ? t('gamma.share.enabledHint') : t('gamma.share.disabledHint')}
        </p>

        {enabled && url ? (
          <div className="space-y-2">
            <Label htmlFor="share-url">{t('gamma.share.copy')}</Label>
            <div className="flex gap-2">
              <Input id="share-url" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={onCopy}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
