import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';
import { cn } from '@/lib/utils';
import { getChangelog, groupByMonth, type ChangelogCategory } from '@/data/changelog';

const CATEGORY_BADGE: Record<ChangelogCategory, string> = {
  added: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  improved: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  fixed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};

const CATEGORY_DOT: Record<ChangelogCategory, string> = {
  added: 'bg-emerald-500',
  improved: 'bg-violet-500',
  fixed: 'bg-amber-500',
};

export function ChangelogPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const months = useMemo(() => groupByMonth(getChangelog()), []);
  const locale = i18n.language;

  const monthLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });

  return (
    <SectionBand>
      <PageHeader
        eyebrow={t('changelog.eyebrow')}
        title={t('changelog.title')}
        subtitle={t('changelog.subtitle')}
      />

      <Container className="mt-14">
        {months.length === 0 ? (
          <p className="text-base text-muted-foreground">{t('changelog.empty')}</p>
        ) : (
          <div className="space-y-16">
            {months.map((month) => (
              <section key={month.key}>
                <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {monthLabel(month.date)}
                </h2>
                <ol className="mt-6 space-y-7 border-l border-border pl-7">
                  {month.entries.map((entry, i) => (
                    <Reveal key={entry.hash} delay={Math.min(i, 6) * 0.04}>
                      <li className="relative">
                        <span
                          className={cn(
                            'absolute -left-[2.05rem] top-1.5 h-3 w-3 rounded-full ring-4 ring-[#fafafa]',
                            CATEGORY_DOT[entry.category],
                          )}
                          aria-hidden
                        />
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              CATEGORY_BADGE[entry.category],
                            )}
                          >
                            {t(`changelog.category.${entry.category}`)}
                          </span>
                          <time className="text-xs tabular-nums text-muted-foreground" dateTime={entry.date}>
                            {dayLabel(entry.date)}
                          </time>
                        </div>
                        <p className="mt-2 text-base font-medium leading-snug md:text-lg">
                          {entry.title}
                        </p>
                        {entry.prUrl ? (
                          <a
                            href={entry.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
                          >
                            #{entry.prNumber}
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        ) : null}
                      </li>
                    </Reveal>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </Container>
    </SectionBand>
  );
}
