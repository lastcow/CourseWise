import { cn } from '@/lib/utils';
import { Container } from './Container';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
};

export function PageHeader({ eyebrow, title, subtitle, align = 'left' }: Props): JSX.Element {
  return (
    <Container className={align === 'center' ? 'text-center' : ''}>
      {eyebrow ? (
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen">
          {eyebrow}
        </div>
      ) : null}
      <h1 className="mt-4 font-display text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.02em] text-balance md:text-[3.75rem]">
        {title}
      </h1>
      {subtitle ? (
        <p
          className={cn(
            'mt-5 max-w-[60ch] text-base leading-relaxed text-ink-400 md:text-lg',
            align === 'center' && 'mx-auto',
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </Container>
  );
}
