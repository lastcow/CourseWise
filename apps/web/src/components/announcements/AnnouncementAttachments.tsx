import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Paperclip } from 'lucide-react';
import { getDownloadUrl } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import type { AnnouncementAttachment } from '@coursewise/shared';

/** Read-only download chips for an announcement's attachments. */
export function AnnouncementAttachments({
  attachments,
}: {
  attachments: AnnouncementAttachment[];
}): JSX.Element | null {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (attachments.length === 0) return null;

  const onDownload = async (fileAssetId: string) => {
    setBusy(fileAssetId);
    try {
      const res = await getDownloadUrl(fileAssetId);
      window.location.href = res.downloadUrl;
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <button
          key={a.fileAssetId}
          type="button"
          onClick={() => onDownload(a.fileAssetId)}
          disabled={busy === a.fileAssetId}
          className="inline-flex max-w-[20rem] items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          title={a.fileName}
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{a.fileName}</span>
          <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ))}
    </div>
  );
}
