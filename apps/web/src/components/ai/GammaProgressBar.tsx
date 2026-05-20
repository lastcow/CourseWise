import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Props = {
  /** ISO timestamp of when the Gamma job was created. */
  createdAt: string;
  /** Optional extra classes for the container. */
  className?: string;
};

// Gamma rarely returns under ~30s. ~60s is a reasonable typical completion
// estimate; longer runs trip the indeterminate animation rather than letting
// the bar sit at 99% with no movement.
const TYPICAL_DURATION_MS = 60_000;
const VERY_LONG_MS = 180_000;
const TICK_MS = 500;

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem === 0 ? `${minutes}m` : `${minutes}m ${rem}s`;
}

/**
 * Progress bar driven by elapsed wall-clock time.
 *
 * Gamma's API doesn't return real progress, so the bar fills smoothly toward
 * 95% over TYPICAL_DURATION_MS and then flips to an indeterminate stripe
 * animation. The intent is to signal "we're still working" without lying about
 * a precise %.
 */
export function GammaProgressBar({ createdAt, className }: Props): JSX.Element {
  const { t } = useTranslation();
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - Date.parse(createdAt)));

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - Date.parse(createdAt)));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [createdAt]);

  const indeterminate = elapsedMs >= TYPICAL_DURATION_MS;
  const stuck = elapsedMs >= VERY_LONG_MS;
  const pct = indeterminate ? 95 : Math.min(95, (elapsedMs / TYPICAL_DURATION_MS) * 95);

  const label = stuck
    ? t('gamma.progress.takingLong')
    : indeterminate
      ? t('gamma.progress.stillWorking')
      : t('gamma.progress.generating');

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{formatElapsed(elapsedMs)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {indeterminate ? (
          <div className="h-full w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-sky-500" />
        ) : (
          <div
            className="h-full rounded-full bg-sky-500 transition-[width] duration-500 ease-linear"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
