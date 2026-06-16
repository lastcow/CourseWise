import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';
import { usePageMeta } from '@/lib/usePageMeta';
import { COMPARISONS } from '@/data/comparisons';

export function CompareHubPage(): JSX.Element {
  usePageMeta({
    title: 'Compare CourseWise — Canvas, Google Classroom, Moodle',
    description:
      'How CourseWise compares to Canvas, Google Classroom, and Moodle — AI-native course operations with FERPA-first record handling on a single teacher/student/admin data model.',
  });

  return (
    <SectionBand>
      <PageHeader
        eyebrow="Compare"
        title="How CourseWise compares."
        subtitle="Honest, side-by-side comparisons with the tools schools already use — including where each alternative is the better fit."
      />
      <Container className="mt-12">
        <div className="grid gap-6 md:grid-cols-3">
          {COMPARISONS.map((c) => (
            <Reveal key={c.slug}>
              <Link
                to={`/compare/${c.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-ink/10 bg-paper p-7 shadow-warm transition-colors hover:border-evergreen/40"
              >
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  CourseWise vs {c.competitor}
                </h2>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-400">{c.verdict}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-evergreen">
                  Read the comparison
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
