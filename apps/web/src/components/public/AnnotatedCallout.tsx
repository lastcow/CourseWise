import { cn } from '@/lib/utils';

type Props = {
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  label: string;
  className?: string;
};

export function AnnotatedCallout({ position, label, className }: Props): JSX.Element {
  const map: Record<Props['position'], string> = {
    'top-right': 'top-3 right-3 text-right',
    'top-left': 'top-3 left-3 text-left',
    'bottom-right': 'bottom-3 right-3 text-right',
    'bottom-left': 'bottom-3 left-3 text-left',
  };
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10 text-[10px] uppercase tracking-[0.18em] text-muted-foreground',
        map[position],
        className,
      )}
    >
      {label}
    </div>
  );
}
