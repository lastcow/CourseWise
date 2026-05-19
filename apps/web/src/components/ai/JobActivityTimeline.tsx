import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiJobEvent, AiJobStatus } from '@coursewise/shared';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'coursewise.ai.showAgentOutput';

// Map workflow event-type wire strings (e.g. "job.started") to the
// camelCase i18n key suffix (e.g. "jobStarted"). The wire format uses
// dots which clash with i18next's keySeparator, so we never look up
// the wire type directly.
const EVENT_TYPE_I18N_KEY: Record<string, string> = {
  'job.started': 'jobStarted',
  'context.loaded': 'contextLoaded',
  'artifact.calling_model': 'artifactCallingModel',
  'artifact.model_responded': 'artifactModelResponded',
  'artifact.saved': 'artifactSaved',
  'artifact.failed': 'artifactFailed',
  'job.finished': 'jobFinished',
};

function levelDot(level: AiJobEvent['level']): string {
  if (level === 'error') return 'bg-red-500';
  if (level === 'warn') return 'bg-amber-500';
  return 'bg-blue-500';
}

function relative(t: (k: string, v?: Record<string, unknown>) => string, isoTs: string): string {
  const delta = Math.max(0, Math.floor((Date.now() - new Date(isoTs).getTime()) / 1000));
  if (delta < 5) return t('ai.activity.relative.justNow');
  if (delta < 60) return t('ai.activity.relative.secondsAgo', { n: delta });
  return t('ai.activity.relative.minutesAgo', { n: Math.floor(delta / 60) });
}

function isRunning(status: AiJobStatus): boolean {
  return status === 'queued' || status === 'running';
}

function readInitialToggle(running: boolean): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch {
    /* SSR / disabled storage */
  }
  return running; // default: on while running, off when finished
}

function eventLabel(t: (k: string) => string, type: string): string {
  const key = EVENT_TYPE_I18N_KEY[type];
  return key ? t(`ai.activity.eventType.${key}`) : type;
}

type Props = {
  status: AiJobStatus;
  events: AiJobEvent[];
};

export function JobActivityTimeline({ status, events }: Props): JSX.Element {
  const { t } = useTranslation();
  const running = isRunning(status);
  const [show, setShow] = useState(() => readInitialToggle(running));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(show));
    } catch {
      /* ignore */
    }
  }, [show]);

  useEffect(() => {
    if (!show || !autoScroll || !running) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [show, autoScroll, running, events.length]);

  function onScroll(): void {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    setAutoScroll(atBottom);
  }

  return (
    <div className="mt-3 rounded border bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-sm font-medium">{t('ai.activity.title')}</div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          {t('ai.activity.showRealtime')}
        </label>
      </div>
      {show ? (
        <div
          ref={listRef}
          onScroll={onScroll}
          className="max-h-72 overflow-y-auto px-3 py-2"
        >
          {events.length === 0 ? (
            <div className="text-xs text-muted-foreground">{t('ai.activity.empty')}</div>
          ) : (
            <ol className="space-y-1.5">
              {events.map((ev) => {
                const isOpen = !!expanded[ev.id];
                const hasMetadata = ev.metadata != null && Object.keys(ev.metadata).length > 0;
                return (
                  <li key={ev.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={cn('mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full', levelDot(ev.level))}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{eventLabel(t, ev.type)}</span>
                        <span className="text-muted-foreground">{ev.message}</span>
                        <span className="ml-auto text-muted-foreground">{relative(t, ev.occurredAt)}</span>
                      </div>
                      {hasMetadata ? (
                        <>
                          <button
                            type="button"
                            className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:underline"
                            onClick={() => setExpanded((m) => ({ ...m, [ev.id]: !isOpen }))}
                          >
                            {t('ai.activity.metadataToggle')}
                          </button>
                          {isOpen ? (
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug">
                              {JSON.stringify(ev.metadata, null, 2)}
                            </pre>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div ref={bottomRef} />
        </div>
      ) : null}
    </div>
  );
}
