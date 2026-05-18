import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center', className)}>
      {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
      <h3 className="text-lg font-medium">{title}</h3>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
