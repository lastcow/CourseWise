import { Link, Navigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';
import { JsonLd } from '@/components/JsonLd';
import { usePageMeta, SITE_URL } from '@/lib/usePageMeta';
import { getComparison } from '@/data/comparisons';

export function ComparePage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const c = getComparison(slug);
  // usePageMeta must run unconditionally (rules of hooks) — pass safe fallbacks
  // when the slug is unknown; we redirect below anyway.
  usePageMeta({
    title: c?.title ?? 'Compare — CourseWise',
    description: c?.description ?? 'Compare CourseWise with other teaching platforms.',
  });
  if (!c) return <Navigate to="/compare" replace />;

  const pageUrl = `${SITE_URL}/compare/${c.slug}/`;
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: c.faq.map((f) => ({
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
      { '@type': 'ListItem', position: 2, name: 'Compare', item: `${SITE_URL}/compare/` },
      { '@type': 'ListItem', position: 3, name: `CourseWise vs ${c.competitor}`, item: pageUrl },
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
                <Link to="/compare" className="hover:text-evergreen">
                  Compare
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-ink">CourseWise vs {c.competitor}</li>
            </ol>
          </nav>
        </Container>
        <PageHeader
          eyebrow="Compare"
          title={`CourseWise vs ${c.competitor}`}
          subtitle={c.verdict}
        />
        <Container className="mt-8">
          <Reveal>
            <p className="max-w-3xl text-base leading-relaxed text-ink-400 md:text-lg">{c.intro}</p>
          </Reveal>

          {/* Comparison table */}
          <Reveal>
            <div className="mt-12 overflow-x-auto rounded-2xl border border-ink/10 shadow-warm">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-paper-200">
                    <th className="px-5 py-3.5 font-semibold text-ink-400">Dimension</th>
                    <th className="px-5 py-3.5 font-semibold text-evergreen">CourseWise</th>
                    <th className="px-5 py-3.5 font-semibold text-ink">{c.competitor}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((r) => (
                    <tr key={r.dim} className="border-t border-ink/10 align-top">
                      <td className="px-5 py-4 font-medium text-ink">{r.dim}</td>
                      <td className="px-5 py-4 text-ink/80">{r.cw}</td>
                      <td className="px-5 py-4 text-ink-400">{r.them}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          {/* Who should pick which — fair, both directions */}
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-2xl border border-evergreen-dark bg-evergreen p-7 text-paper shadow-warm">
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  Choose CourseWise if…
                </h2>
                <ul className="mt-5 space-y-3 text-sm">
                  {c.pickCw.map((p) => (
                    <li key={p} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-paper" aria-hidden />
                      <span className="text-paper/90">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal>
              <div className="h-full rounded-2xl border border-ink/10 bg-paper p-7 shadow-warm">
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  Choose {c.competitor} if…
                </h2>
                <ul className="mt-5 space-y-3 text-sm">
                  {c.pickThem.map((p) => (
                    <li key={p} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden />
                      <span className="text-ink/80">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </Container>
      </SectionBand>

      {/* FAQ */}
      <SectionBand className="!pt-0">
        <Container>
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] md:text-[2.4rem]">
              CourseWise vs {c.competitor}: FAQ
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-x-12 gap-y-9 md:grid-cols-2">
            {c.faq.map((item) => (
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
                <Link to="/features">See all features</Link>
              </Button>
            </div>
          </Reveal>
        </Container>
      </SectionBand>
    </>
  );
}
