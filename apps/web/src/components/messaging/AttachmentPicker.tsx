import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { uploadFile } from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { formatBytes } from '@/lib/formatBytes';
import { MAX_UPLOAD_BYTES, MESSAGE_ATTACHMENT_ACCEPT } from '@coursewise/shared';

export interface PickedAttachment {
  fileAssetId: string;
  name: string;
  size: number;
}

/**
 * Message-attachment picker shared by the reply composer and the compose
 * dialog: a paperclip button that uploads on selection (with progress %),
 * then a removable chip. The upload uses relatedType 'message'; the server
 * links the asset to the message at send time.
 */
export function AttachmentPicker({
  courseId,
  value,
  onChange,
  disabled,
  onUploadingChange,
}: {
  courseId: string;
  value: PickedAttachment | null;
  onChange: (a: PickedAttachment | null) => void;
  disabled?: boolean;
  /** Lets the host disable its send button while an upload is in flight. */
  onUploadingChange?: (uploading: boolean) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onPickFile(file: File): Promise<void> {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.push({ title: t('files.tooLarge'), tone: 'error' });
      return;
    }
    setUploadPct(0);
    onUploadingChange?.(true);
    try {
      const uploaded = await uploadFile(file, courseId, 'message', (pct) => setUploadPct(pct));
      onChange({ fileAssetId: uploaded.fileAssetId, name: file.name, size: file.size });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    } finally {
      setUploadPct(null);
      onUploadingChange?.(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={MESSAGE_ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPickFile(f);
          e.target.value = '';
        }}
      />
      {value ? (
        <span className="flex min-w-0 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="max-w-[14rem] truncate">{value.name}</span>
          <span className="shrink-0 text-muted-foreground">{formatBytes(value.size)}</span>
          <button
            type="button"
            aria-label={t('messages.attachRemove')}
            onClick={() => onChange(null)}
            className="shrink-0 rounded-full p-0.5 hover:bg-accent"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={uploadPct !== null || disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadPct !== null ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              {uploadPct}%
            </>
          ) : (
            <>
              <Paperclip className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t('messages.attachCta')}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
