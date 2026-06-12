import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { useToast } from '@/components/ui/toast';
import { useSendMessage } from '@/lib/queries';
import { AttachmentPicker, type PickedAttachment } from '@/components/messaging/AttachmentPicker';
import { ApiClientError } from '@/lib/api';
import { MESSAGE_PRIORITIES, type MessagePriority } from '@coursewise/shared';
import { cn } from '@/lib/utils';

export interface RecipientOption {
  id: string;
  name: string;
  email: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  courseId: string;
  /** Fixed recipient. Omit and pass recipientOptions instead to let the user
   *  pick from a dropdown — the Messages page "New message" flow. */
  recipientId?: string;
  recipientName?: string;
  /** When set, a recipient dropdown is rendered (fixed mode hides it). */
  recipientOptions?: RecipientOption[];
  /** Called with the created/updated thread id after a successful send. */
  onSent?: (threadId: string) => void;
  /** Optional pre-filled subject. The user can still edit. */
  initialSubject?: string;
  /** Optional starting priority. Defaults to 'normal'. */
  initialPriority?: MessagePriority;
  /** Muted helper line rendered above the body, e.g. "About: Assignment 3". */
  contextLine?: string;
  /** Existing thread to append to. If omitted, a new thread is created. */
  threadId?: string;
};

const PRIORITY_TONE: Record<MessagePriority, string> = {
  normal: 'text-muted-foreground',
  high: 'text-amber-600',
  urgent: 'text-red-600',
};

export function MessageComposeDialog({
  open,
  onClose,
  courseId,
  recipientId,
  recipientName,
  recipientOptions,
  onSent,
  initialSubject,
  initialPriority = 'normal',
  contextLine,
  threadId,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const send = useSendMessage(courseId);
  const [subject, setSubject] = useState(initialSubject ?? '');
  const [priority, setPriority] = useState<MessagePriority>(initialPriority);
  const [body, setBody] = useState('');
  const [pickedRecipient, setPickedRecipient] = useState('');
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const [uploading, setUploading] = useState(false);

  // Re-prime state when the dialog is (re-)opened against a different target.
  useEffect(() => {
    if (open) {
      setSubject(initialSubject ?? '');
      setPriority(initialPriority);
      setBody('');
      setPickedRecipient('');
      setAttachment(null);
    }
  }, [open, initialSubject, initialPriority]);

  const effectiveRecipientId = recipientId || pickedRecipient;
  const trimmedBody = body.trim();
  const disabled = send.isPending || uploading || trimmedBody.length === 0 || !effectiveRecipientId;

  const onSubmit = async () => {
    if (disabled) return;
    try {
      const result = await send.mutateAsync({
        recipientId: effectiveRecipientId,
        threadId,
        subject: subject.trim() || undefined,
        body: trimmedBody,
        priority,
        ...(attachment ? { fileAssetId: attachment.fileAssetId } : {}),
      });
      toast.push({ title: t('messages.sent'), tone: 'success' });
      onSent?.(result.threadId);
      onClose();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={send.isPending ? () => undefined : onClose}
      title={
        recipientName
          ? t('messages.composeTitle', { name: recipientName })
          : t('messages.composeNewTitle')
      }
      dismissOnBackdropClick={false}
    >
      <div className="space-y-3">
        {contextLine ? (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {contextLine}
          </div>
        ) : null}

        {recipientOptions && !recipientId ? (
          <div className="space-y-1">
            <Label htmlFor="mc-recipient">{t('messages.recipientLabel')}</Label>
            <RecipientCombobox
              options={recipientOptions}
              value={pickedRecipient}
              onChange={setPickedRecipient}
              disabled={send.isPending}
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="mc-subject">{t('messages.subjectLabel')}</Label>
          <Input
            id="mc-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder={t('messages.subjectPlaceholder')}
            disabled={send.isPending || !!threadId}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="mc-priority">{t('messages.priorityLabel')}</Label>
          <select
            id="mc-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as MessagePriority)}
            disabled={send.isPending}
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm',
              PRIORITY_TONE[priority],
            )}
          >
            {MESSAGE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`messages.priority${p[0]!.toUpperCase()}${p.slice(1)}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mc-body">{t('messages.bodyLabel')}</Label>
          <MarkdownEditor
            id="mc-body"
            value={body}
            onChange={setBody}
            disabled={send.isPending}
            placeholder={t('messages.bodyPlaceholder')}
            minHeight={180}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <AttachmentPicker
            courseId={courseId}
            value={attachment}
            onChange={setAttachment}
            disabled={send.isPending}
            onUploadingChange={setUploading}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={send.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void onSubmit()} disabled={disabled}>
              {send.isPending ? t('common.loading') : t('messages.send')}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Searchable recipient picker: a text input that filters the options by name OR
 * email as you type, with a click/Enter-to-pick dropdown. Replaces a plain
 * <select> so large rosters stay navigable. Self-contained (no external combobox
 * dep); the parent owns the selected id via `value`/`onChange`.
 */
function RecipientCombobox({
  options,
  value,
  onChange,
  disabled,
}: {
  options: RecipientOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const labelFor = (r: RecipientOption): string => r.name || r.email;

  // Outside-click dismiss while open (Esc is handled on the input itself).
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(q))
    : options;

  const pick = (r: RecipientOption): void => {
    onChange(r.id);
    setQuery(labelFor(r));
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        id="mc-recipient"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        disabled={disabled}
        placeholder={t('messages.recipientSearchPlaceholder')}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Typing a new search invalidates any prior pick until one is chosen.
          if (value) onChange('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
          } else if (e.key === 'Enter' && open && filtered.length > 0) {
            e.preventDefault();
            pick(filtered[0]!);
          }
        }}
      />
      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-card text-card-foreground shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t('messages.recipientNoMatch')}
            </li>
          ) : (
            filtered.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={r.id === value}
                  // Keep the input focused so this click registers before blur.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(r)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none',
                    r.id === value && 'bg-accent',
                  )}
                >
                  <span className="text-sm font-medium">{r.name || r.email}</span>
                  {r.name ? <span className="text-xs text-muted-foreground">{r.email}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
