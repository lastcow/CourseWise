import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import type { AiChatMessage, AiChatResponse } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MarkdownView } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import { pickI18nKey } from '@/lib/api';
import { cn } from '@/lib/utils';

const HISTORY_SENT_MAX = 8;

export interface AiChatBubbleProps {
  /** Panel heading. */
  title: string;
  /** Small badge next to the title, e.g. "Free during beta". */
  badge?: string;
  /** Assistant message preseeded into a fresh conversation. */
  welcome: string;
  /** Input placeholder. */
  placeholder: string;
  /** One-line footer disclaimer. */
  disclaimer?: string;
  /** aria-label for the floating button. */
  openLabel: string;
  /** Label shown while waiting for the reply, e.g. "Thinking…". */
  thinkingLabel: string;
  /**
   * Send one turn. `history` is the prior conversation (welcome excluded),
   * capped to the last few messages. Implementations call their feature's
   * endpoint; the widget itself is feature-agnostic so any page can reuse it.
   */
  send: (message: string, history: AiChatMessage[]) => Promise<AiChatResponse>;
}

/**
 * Generic floating AI chat: a bottom-right bubble that expands into a chat
 * panel. All copy and the transport come in via props — mount it on any page
 * with a feature-specific `send`.
 */
export function AiChatBubble({
  title,
  badge,
  welcome,
  placeholder,
  disclaimer,
  openLabel,
  thinkingLabel,
  send,
}: AiChatBubbleProps): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function submit(): Promise<void> {
    const message = draft.trim();
    if (!message || pending) return;
    const history = messages.slice(-HISTORY_SENT_MAX);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setDraft('');
    setPending(true);
    try {
      const res = await send(message, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      // The user's message stays in the transcript; they can retry by sending
      // again. Rate-limit and upstream errors map to existing i18n keys.
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label={openLabel}
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105"
      >
        <Sparkles className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex h-[min(30rem,calc(100vh-5rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
      <header className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">{title}</h2>
        {badge ? <Badge variant="info">{badge}</Badge> : null}
        <button
          type="button"
          aria-label={t('common.cancel')}
          onClick={() => setOpen(false)}
          className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div ref={logRef} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <AssistantBubble content={welcome} />
        {messages.map((m, i) =>
          m.role === 'assistant' ? (
            <AssistantBubble key={i} content={m.content} />
          ) : (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.content}
              </div>
            </div>
          ),
        )}
        {pending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {thinkingLabel}
          </div>
        ) : null}
      </div>

      <footer className="border-t px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder={placeholder}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                void submit();
              }
            }}
            className={cn(
              'max-h-24 min-h-[2.25rem] flex-1 resize-none rounded-md border bg-background px-3 py-1.5 text-sm',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
          <Button size="sm" onClick={() => void submit()} disabled={pending || !draft.trim()}>
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        {disclaimer ? (
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{disclaimer}</p>
        ) : null}
      </footer>
    </div>
  );
}

function AssistantBubble({ content }: { content: string }): JSX.Element {
  return (
    <div className="flex">
      <div className="max-w-[90%] rounded-lg rounded-bl-sm border bg-muted/40 px-3 py-2 text-sm [&_p]:my-1 [&_ul]:my-1">
        <MarkdownView source={content} />
      </div>
    </div>
  );
}
