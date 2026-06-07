import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

/** Consistent header for a course "section" list page (materials, presentations,
 *  …): title + an optional item count + description, with a right-aligned slot
 *  for the page's primary actions / toolbar. */
export function CourseSectionHeader({
  title,
  count,
  description,
  actions,
}: {
  title: string;
  count?: number;
  description?: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {count != null ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Skeleton rows inside a Card — a calmer loading state than bare "Loading…". */
export function ListSkeleton({ rows = 6 }: { rows?: number }): JSX.Element {
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-4 w-44 animate-pulse rounded bg-muted" />
            <div className="hidden h-4 flex-1 animate-pulse rounded bg-muted sm:block" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-7 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
