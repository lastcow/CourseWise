import { cn } from '@/lib/utils';

export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('mx-auto max-w-[1280px] px-6 md:px-10', className)}>{children}</div>
  );
}
