import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';

const BELIEFS = [
  { title: 'Transparency', body: "Show admins exactly which model is being called, what it cost, and what it wrote. Every prompt template is editable. Every job emits a live activity timeline." },
  { title: 'FERPA-first', body: "Schools sign a real DPA on day one. Records are auditable. Deletion is a request, not a ticket queue. We act as a 'school official' under §99.31, not a marketing CRM in disguise." },
  { title: 'AI you control', body: "Admins choose the providers, models, and price ceilings. Teachers see the costs. Students never see raw model output unrevised." },
];

export function AboutPage(): JSX.Element {
  return (
    <>
      <SectionBand>
        <PageHeader
          eyebrow="About"
          title="Built by people who actually taught."
          subtitle="CourseWise started because the existing tools made teachers fight three logins to do one job. We're building the unified, FERPA-first version we wish we'd had."
        />
      </SectionBand>
      <SectionBand tone="dark" grain>
        <Container>
          <Reveal>
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen-200">
                What we believe
              </div>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-[1.08] tracking-[-0.02em] md:text-[2.6rem]">
                Three stances that drive the product.
              </h2>
            </div>
          </Reveal>
          <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {BELIEFS.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.05}>
                <div className="border-t border-paper/15 pt-5">
                  <div className="font-display text-xl font-semibold tabular-nums text-evergreen-200">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">
                    {b.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-paper/60">{b.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </SectionBand>
      <SectionBand>
        <Container>
          <Reveal>
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen">Team</div>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-[1.08] tracking-[-0.02em] md:text-[2.6rem]">
                A small team building in the open.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-ink-400 md:text-lg">
                We ship in small commits and publish our roadmap publicly. The codebase, the
                migrations, and the open issues are visible on GitHub. The fastest way to influence
                what we build next is to email us.
              </p>
            </div>
          </Reveal>
        </Container>
      </SectionBand>
    </>
  );
}
