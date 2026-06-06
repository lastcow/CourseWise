import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';

// TODO_SET_PRICING: confirm dollar amounts and routing before launch
const TIERS = [
  {
    name: 'Educators',
    price: 'Custom',
    cadence: 'per teacher / month',
    summary: 'For individual educators and small departments running pilots.',
    cta: { label: 'Talk to us', to: '/contact' },
    features: [
      'Up to 5 courses',
      'AI material generation (BYO API key or pooled credits)',
      'Markdown editor and gradebook',
      'Community support',
    ],
  },
  {
    name: 'Institutions',
    price: 'Custom',
    cadence: 'per student / year, billed annually',
    summary: 'For schools, districts, and higher-ed departments.',
    cta: { label: 'Talk to sales', to: '/contact' },
    features: [
      'Unlimited courses, modules, materials',
      'Centralized AI provider + model governance',
      'Prompt template editor per artifact kind',
      'Audit log + SSO + SCIM',
      'Signed DPA, FERPA-aligned record handling',
      'Priority support with named CSM',
    ],
    highlighted: true,
  },
];

const FAQ: Array<{ q: string; a: ReactNode }> = [
  { q: 'How is AI usage billed?', a: 'We pass through the model provider cost at the institutional tier. Educators can either supply their own API keys (BYOK) or use a pool with usage caps.' },
  { q: 'Do you offer a free trial for institutions?', a: 'Yes — typically a 30-day pilot scoped to one or two courses, with a dedicated CSM and a signed pilot DPA.' },
  { q: 'Can we self-host?', a: 'Not yet. CourseWise runs on Cloudflare Workers + Neon Postgres + R2. Air-gapped deployment is on the roadmap; reach out if it gates your purchase.' },
  { q: 'What about FERPA?', a: <>See our <Link to="/legal/ferpa" className="font-medium text-evergreen hover:underline">FERPA Statement</Link> and the <Link to="/legal/security" className="font-medium text-evergreen hover:underline">Trust page</Link>.</> },
  { q: 'How is student data deleted?', a: 'You can submit a deletion request through the data-requests page; we process within 7 calendar days and provide an audit receipt.' },
  { q: 'Is pricing negotiable?', a: 'Volume and multi-year commitments unlock discounts. Smaller institutions: ask about our reduced-rate program.' },
];

export function PricingPage(): JSX.Element {
  return (
    <>
      <SectionBand>
        <PageHeader
          eyebrow="Pricing"
          title="Honest pricing for serious schools."
          subtitle="Pay for what you use. No per-feature seat math, no AI surprise bills."
        />
        <Container className="mt-12">
          <div className="grid items-start gap-6 md:grid-cols-2">
            {TIERS.map((tier) => {
              const hi = tier.highlighted;
              return (
                <Reveal key={tier.name}>
                  <div
                    className={
                      'grain relative overflow-hidden rounded-2xl border p-8 shadow-warm ' +
                      (hi
                        ? 'border-evergreen-dark bg-evergreen text-paper shadow-warm-lg'
                        : 'border-ink/10 bg-paper')
                    }
                  >
                    {hi ? (
                      <span className="absolute right-5 top-5 rounded-md bg-paper/15 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-paper">
                        Recommended
                      </span>
                    ) : null}
                    <div
                      className={
                        'text-xs font-semibold uppercase tracking-[0.2em] ' +
                        (hi ? 'text-paper/70' : 'text-evergreen')
                      }
                    >
                      {tier.name}
                    </div>
                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="font-display text-4xl font-semibold tracking-tight">
                        {tier.price}
                      </span>
                      <span className={'text-sm ' + (hi ? 'text-paper/70' : 'text-ink-400')}>
                        {tier.cadence}
                      </span>
                    </div>
                    <p className={'mt-3 text-sm ' + (hi ? 'text-paper/80' : 'text-ink-400')}>
                      {tier.summary}
                    </p>
                    <Button
                      asChild
                      className={
                        'mt-6 w-full ' +
                        (hi
                          ? 'bg-paper text-ink hover:bg-paper-200'
                          : 'bg-evergreen text-paper hover:bg-evergreen-dark')
                      }
                    >
                      <Link to={tier.cta.to}>{tier.cta.label}</Link>
                    </Button>
                    <ul className="mt-6 space-y-2.5 text-sm">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <Check
                            className={
                              'mt-0.5 h-4 w-4 shrink-0 ' + (hi ? 'text-paper' : 'text-evergreen')
                            }
                            aria-hidden
                          />
                          <span className={hi ? 'text-paper/90' : 'text-ink/80'}>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <Reveal>
            <div className="mt-8 rounded-xl border border-ink/10 bg-paper-200 p-5 text-sm text-ink/80">
              <span className="font-medium text-ink">Need a DPA, BAA, or state addendum?</span>{' '}
              <Link to="/legal/security" className="font-medium text-evergreen hover:underline">
                See the Trust page
              </Link>{' '}
              or{' '}
              <Link to="/contact" className="font-medium text-evergreen hover:underline">
                contact us
              </Link>
              .
            </div>
          </Reveal>
        </Container>
      </SectionBand>

      <SectionBand className="!pt-0">
        <Container>
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] md:text-[2.4rem]">
              Pricing FAQ
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-x-12 gap-y-9 md:grid-cols-2">
            {FAQ.map((item) => (
              <Reveal key={item.q}>
                <h3 className="font-display text-lg font-semibold tracking-tight">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">{item.a}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </SectionBand>
    </>
  );
}
