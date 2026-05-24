import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { useToast } from '@/components/ui/toast';
import { useSendMessage } from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { MESSAGE_PRIORITIES, type MessagePriority } from '@coursewise/shared';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  courseId: string;
  recipientId: string;
  recipientName: string;
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

  // Re-prime state when the dialog is (re-)opened against a different target.
  useEffect(() => {
    if (open) {
      setSubject(initialSubject ?? '');
      setPriority(initialPriority);
      setBody('');
    }
  }, [open, initialSubject, initialPriority]);

  const trimmedBody = body.trim();
  const disabled = send.isPending || trimmedBody.length === 0;

  const onSubmit = async () => {
    if (disabled) return;
    try {
      await send.mutateAsync({
        recipientId,
        threadId,
        subject: subject.trim() || undefined,
        body: trimmedBody,
        priority,
      });
      toast.push({ title: t('messages.sent'), tone: 'success' });
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
      title={t('messages.composeTitle', { name: recipientName })}
      dismissOnBackdropClick={false}
    >
      <div className="space-y-3">
        {contextLine ? (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {contextLine}
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

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void onSubmit()} disabled={disabled}>
            {send.isPending ? t('common.loading') : t('messages.send')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
