import { cn } from '@/lib/utils';

type Props = {
  tone?: 'light' | 'dark';
  /** Overlay a subtle paper grain for tactile depth. */
  grain?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function SectionBand({
  tone = 'light',
  grain = false,
  children,
  className,
}: Props): JSX.Element {
  return (
    <section
      className={cn(
        'relative py-24 md:py-32',
        tone === 'dark' ? 'bg-ink text-paper' : 'bg-paper text-ink',
        grain && (tone === 'dark' ? 'grain grain-dark' : 'grain'),
        className,
      )}
    >
      {children}
    </section>
  );
}
