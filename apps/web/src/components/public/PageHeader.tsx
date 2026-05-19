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
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </div>
      ) : null}
      <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl leading-[1.05]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
          {subtitle}
        </p>
      ) : null}
    </Container>
  );
}
