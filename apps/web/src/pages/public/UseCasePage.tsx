import { Link, Navigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';
import { JsonLd } from '@/components/JsonLd';
import { usePageMeta, SITE_URL } from '@/lib/usePageMeta';
import { getUseCase } from '@/data/useCases';

export function UseCasePage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const u = getUseCase(slug);
  usePageMeta({
    title: u?.title ?? 'Use cases — CourseWise',
    description: u?.description ?? 'How schools and educators use CourseWise.',
  });
  if (!u) return <Navigate to="/use-cases" replace />;

  const pageUrl = `${SITE_URL}/use-cases/${u.slug}/`;
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: u.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Use cases', item: `${SITE_URL}/use-cases/` },
      { '@type': 'ListItem', position: 3, name: u.segment, item: pageUrl },
    ],
  };

  return (
    <>
      <JsonLd data={faqJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />

      <SectionBand>
        <Container>
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-400">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link to="/" className="hover:text-evergreen">
                  Home
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link to="/use-cases" className="hover:text-evergreen">
                  Use cases
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-ink">{u.segment}</li>
            </ol>
          </nav>
        </Container>
        <PageHeader eyebrow="Use case" title={u.heading} subtitle={u.verdict} />
        <Container className="mt-8">
          <Reveal>
            <p className="max-w-3xl text-base leading-relaxed text-ink-400 md:text-lg">{u.intro}</p>
          </Reveal>

          {/* Challenges → solutions */}
          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <Reveal>
              <h2 className="font-display text-2xl font-semibold tracking-tight">The challenges</h2>
              <dl className="mt-6 space-y-5">
                {u.challenges.map((c) => (
                  <div key={c.title} className="border-l-2 border-ink/15 pl-4">
                    <dt className="font-medium text-ink">{c.title}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-ink-400">{c.body}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
            <Reveal>
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                How CourseWise helps
              </h2>
              <dl className="mt-6 space-y-5">
                {u.solutions.map((s) => (
                  <div key={s.title} className="border-l-2 border-evergreen/40 pl-4">
                    <dt className="font-medium text-ink">{s.title}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-ink-400">{s.body}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* Highlights */}
          <Reveal>
            <div className="mt-12 rounded-2xl border border-ink/10 bg-paper-200 p-7">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen">
                What you get
              </h2>
              <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {u.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden />
                    <span className="text-ink/80">{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </Container>
      </SectionBand>

      {/* FAQ + CTA */}
      <SectionBand className="!pt-0">
        <Container>
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] md:text-[2.4rem]">
              {u.segment}: FAQ
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-x-12 gap-y-9 md:grid-cols-2">
            {u.faq.map((item) => (
              <Reveal key={item.q}>
                <h3 className="font-display text-lg font-semibold tracking-tight">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">{item.a}</p>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="mt-12 flex flex-wrap items-center gap-3">
              <Button asChild className="bg-evergreen text-paper hover:bg-evergreen-dark">
                <Link to="/contact">Talk to us</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/pricing">See pricing</Link>
              </Button>
            </div>
          </Reveal>
        </Container>
      </SectionBand>
    </>
  );
}
