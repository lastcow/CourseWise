import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';
import { usePageMeta } from '@/lib/usePageMeta';
import { USE_CASES } from '@/data/useCases';

export function UseCasesHubPage(): JSX.Element {
  usePageMeta({
    title: 'Use cases — CourseWise for K-12, higher ed, and educators',
    description:
      'How CourseWise fits different teaching contexts: FERPA- and COPPA-first for K-12 schools, AI-native assessment for higher-ed departments, and fast AI authoring for individual educators.',
  });

  return (
    <SectionBand>
      <PageHeader
        eyebrow="Use cases"
        title="Built for how you teach."
        subtitle="The same FERPA-first platform, framed for your context — from district-wide K-12 to a single educator."
      />
      <Container className="mt-12">
        <div className="grid gap-6 md:grid-cols-3">
          {USE_CASES.map((u) => (
            <Reveal key={u.slug}>
              <Link
                to={`/use-cases/${u.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-ink/10 bg-paper p-7 shadow-warm transition-colors hover:border-evergreen/40"
              >
                <h2 className="font-display text-xl font-semibold tracking-tight">{u.segment}</h2>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-400">{u.verdict}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-evergreen">
                  Explore
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </SectionBand>
  );
}
