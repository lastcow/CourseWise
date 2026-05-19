import { cn } from '@/lib/utils';

type Props = {
  tone?: 'light' | 'dark';
  children: React.ReactNode;
  className?: string;
};

export function SectionBand({ tone = 'light', children, className }: Props): JSX.Element {
  return (
    <section
      className={cn(
        'py-24 md:py-32',
        tone === 'dark'
          ? 'bg-[#0a0a0a] text-[#fafafa]'
          : 'bg-[#fafafa] text-[#0a0a0a]',
        className,
      )}
    >
      {children}
    </section>
  );
}
