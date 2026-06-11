import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, Paperclip, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { MarkdownView } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  getDownloadUrl,
  uploadFile,
  useDeleteMessageThread,
  useMessageThread,
  useMessageThreads,
  useSendMessage,
} from '@/lib/queries';
import { ApiClientError, getStoredAuth } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  MAX_UPLOAD_BYTES,
  MESSAGE_ATTACHMENT_ACCEPT,
  MESSAGE_PRIORITIES,
  type MessageAttachment,
  type MessagePriority,
  type MessageThreadSummary,
} from '@coursewise/shared';

function formatBytes(n: number | null): string {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compact card rendered inside a message bubble for its attachment. */
function AttachmentCard({ attachment }: { attachment: MessageAttachment }): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function onDownload(): Promise<void> {
    setBusy(true);
    try {
      const { downloadUrl } = await getDownloadUrl(attachment.fileAssetId);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void onDownload()}
      disabled={busy}
      className="mt-2 flex w-full items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted"
      title={t('common.download')}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.fileName}</span>
        <span className="block text-[11px] text-muted-foreground">
          {formatBytes(attachment.sizeBytes)}
        </span>
      </span>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
    </button>
  );
}

const PRIORITY_BADGE: Record<MessagePriority, 'secondary' | 'warning' | 'destructive'> = {
  normal: 'secondary',
  high: 'warning',
  urgent: 'destructive',
};

const PRIORITY_TONE: Record<MessagePriority, string> = {
  normal: 'text-muted-foreground',
  high: 'text-amber-600',
  urgent: 'text-red-600',
};

/**
 * Single Messages page used by both teachers and students — the API enforces
 * who-can-message-whom, so the UI is role-agnostic. Two-pane layout: thread
 * list on the left (with search + delete + priority badge), thread detail on
 * the right (chronological messages + reply composer). Polls list + detail
 * every 15s so the inbox stays current while the user is on the page.
 */
export function MessagesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cId = courseId ?? '';
  const toast = useToast();
  const confirm = useConfirm();
  const myUserId = getStoredAuth()?.user.id ?? '';

  const threadsQ = useMessageThreads(cId || undefined);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const detailQ = useMessageThread(cId || undefined, activeThreadId);
  const send = useSendMessage(cId);
  const del = useDeleteMessageThread(cId);

  const [reply, setReply] = useState('');
  const [replyPriority, setReplyPriority] = useState<MessagePriority>('normal');
  // Attachment picked for the next send: uploaded immediately on selection,
  // kept as a chip until the message goes out.
  const [attachment, setAttachment] = useState<{
    fileAssetId: string;
    name: string;
    size: number;
  } | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onPickFile(file: File): Promise<void> {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.push({ title: t('files.tooLarge'), tone: 'error' });
      return;
    }
    setUploadPct(0);
    try {
      const uploaded = await uploadFile(file, cId, 'message', (pct) => setUploadPct(pct));
      setAttachment({ fileAssetId: uploaded.fileAssetId, name: file.name, size: file.size });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    } finally {
      setUploadPct(null);
    }
  }

  const visibleThreads = useMemo(() => {
    const all = threadsQ.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (th) =>
        th.subject.toLowerCase().includes(s) ||
        th.otherParticipant.name.toLowerCase().includes(s) ||
        th.otherParticipant.email.toLowerCase().includes(s) ||
        th.lastMessagePreview.toLowerCase().includes(s),
    );
  }, [threadsQ.data, search]);

  const onDelete = async (th: MessageThreadSummary) => {
    const ok = await confirm({
      title: t('messages.deleteTitle'),
      description: t('messages.deleteBody'),
      detail: {
        name: th.subject,
        facts: [{ label: t('messages.deleteWithLabel'), value: th.otherParticipant.name }],
      },
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    try {
      await del.mutateAsync(th.threadId);
      toast.push({ title: t('messages.deleted'), tone: 'success' });
      if (activeThreadId === th.threadId) setActiveThreadId(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onReply = async () => {
    const detail = detailQ.data;
    if (!detail || !reply.trim()) return;
    try {
      await send.mutateAsync({
        recipientId: detail.otherParticipant.id,
        threadId: detail.threadId,
        body: reply.trim(),
        priority: replyPriority,
        ...(attachment ? { fileAssetId: attachment.fileAssetId } : {}),
      });
      setReply('');
      setReplyPriority('normal');
      setAttachment(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('messages.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('messages.help')}</p>
      </header>

      <div className="grid h-[calc(100vh-220px)] grid-cols-1 gap-3 md:grid-cols-[320px_1fr]">
        {/* Threads pane */}
        <aside className="flex h-full flex-col overflow-hidden rounded-md border">
          <div className="border-b bg-muted/30 p-2">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('messages.searchPlaceholder')}
              className="h-8"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {threadsQ.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : visibleThreads.length === 0 ? (
              <EmptyState title={t('messages.noThreads')} />
            ) : (
              <ul>
                {visibleThreads.map((th) => {
                  const active = th.threadId === activeThreadId;
                  const hasUnread = th.unreadCount > 0;
                  return (
                    <li
                      key={th.threadId}
                      className={cn(
                        'group flex cursor-pointer items-start gap-2 border-b px-3 py-2 transition-colors',
                        active ? 'bg-muted' : 'hover:bg-muted/50',
                      )}
                      onClick={() => setActiveThreadId(th.threadId)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'truncate text-sm',
                              hasUnread ? 'font-semibold' : 'font-medium',
                            )}
                          >
                            {th.otherParticipant.name || th.otherParticipant.email}
                          </span>
                          {th.highestUnreadPriority && th.highestUnreadPriority !== 'normal' ? (
                            <Badge variant={PRIORITY_BADGE[th.highestUnreadPriority]}>
                              {t(
                                `messages.priority${th.highestUnreadPriority[0]!.toUpperCase()}${th.highestUnreadPriority.slice(1)}`,
                              )}
                            </Badge>
                          ) : null}
                          {hasUnread ? (
                            <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                              {th.unreadCount}
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{th.subject}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground/80">
                          {th.lastMessagePreview || '—'}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={t('messages.delete')}
                        title={t('messages.delete')}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDelete(th);
                        }}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Detail pane */}
        <section className="flex h-full flex-col overflow-hidden rounded-md border">
          {!activeThreadId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t('messages.noSelection')}
            </div>
          ) : detailQ.isLoading || !detailQ.data ? (
            <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <>
              <header className="flex items-baseline justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {detailQ.data.otherParticipant.name || detailQ.data.otherParticipant.email}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {detailQ.data.subject}
                  </div>
                </div>
              </header>
              <div className="flex-1 overflow-y-auto p-3">
                <ul className="space-y-3">
                  {detailQ.data.messages.map((m) => {
                    const mine = m.senderId === myUserId;
                    return (
                      <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[80%] rounded-lg border p-3 shadow-sm',
                            mine ? 'bg-primary/5' : 'bg-card',
                          )}
                        >
                          <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{new Date(m.createdAt).toLocaleString()}</span>
                            {m.priority !== 'normal' ? (
                              <Badge variant={PRIORITY_BADGE[m.priority]}>
                                {t(
                                  `messages.priority${m.priority[0]!.toUpperCase()}${m.priority.slice(1)}`,
                                )}
                              </Badge>
                            ) : null}
                          </div>
                          <MarkdownView source={m.body} />
                          {m.attachment ? <AttachmentCard attachment={m.attachment} /> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <footer className="space-y-2 border-t bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t('messages.priorityLabel')}:</span>
                  <select
                    value={replyPriority}
                    onChange={(e) => setReplyPriority(e.target.value as MessagePriority)}
                    disabled={send.isPending}
                    className={cn(
                      'h-7 rounded-md border border-input bg-background px-2 text-xs',
                      PRIORITY_TONE[replyPriority],
                    )}
                  >
                    {MESSAGE_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {t(`messages.priority${p[0]!.toUpperCase()}${p.slice(1)}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <MarkdownEditor
                  value={reply}
                  onChange={setReply}
                  placeholder={t('messages.replyPlaceholder')}
                  disabled={send.isPending}
                  minHeight={120}
                />
                <div className="flex items-center justify-between gap-2">
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
                    {attachment ? (
                      <span className="flex min-w-0 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs">
                        <FileText
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="max-w-[14rem] truncate">{attachment.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatBytes(attachment.size)}
                        </span>
                        <button
                          type="button"
                          aria-label={t('messages.attachRemove')}
                          onClick={() => setAttachment(null)}
                          className="shrink-0 rounded-full p-0.5 hover:bg-accent"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploadPct !== null || send.isPending}
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
                  <Button
                    onClick={() => void onReply()}
                    disabled={send.isPending || uploadPct !== null || !reply.trim()}
                  >
                    {send.isPending ? t('common.loading') : t('messages.send')}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
