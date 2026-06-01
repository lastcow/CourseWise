import { cn } from '@/lib/utils';

/**
 * Thin progress bar. `value` is a 0–100 percentage (clamped). The track and
 * violet fill mirror the per-category bars on the gradebook detail page so the
 * visual language stays consistent across the app.
 */
export function Progress({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}): JSX.Element {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full bg-violet-500 transition-[width]', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
