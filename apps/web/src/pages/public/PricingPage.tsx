import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';

// TODO_SET_PRICING: confirm dollar amounts before launch
const TIERS = [
  {
    name: 'Educators',
    price: '$X',
    cadence: '/ teacher / month',
    summary: 'For individual educators and small departments running pilots.',
    cta: { label: 'Start free', to: '/register' },
    features: [
      'Up to 5 courses',
      'AI material generation (BYO API key or pooled credits)',
      'Markdown editor and gradebook',
      'Community support',
    ],
  },
  {
    name: 'Institutions',
    price: '$Y',
    cadence: '/ student / year, billed annually',
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
  { q: 'What about FERPA?', a: <>See our <Link to="/legal/ferpa" className="underline">FERPA Statement</Link> and the <Link to="/legal/security" className="underline">Trust page</Link>.</> },
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
          <div className="grid gap-6 md:grid-cols-2">
            {TIERS.map((tier) => (
              <Reveal key={tier.name}>
                <div
                  className={
                    'rounded-2xl border bg-white p-8 ' +
                    (tier.highlighted ? 'border-violet-300 shadow-2xl shadow-violet-100/40 ring-1 ring-violet-200' : '')
                  }
                >
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {tier.name}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight">{tier.price}</span>
                    <span className="text-sm text-muted-foreground">{tier.cadence}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{tier.summary}</p>
                  <Button asChild className="mt-6 w-full">
                    <Link to={tier.cta.to}>{tier.cta.label}</Link>
                  </Button>
                  <ul className="mt-6 space-y-2 text-sm">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="mt-8 rounded-xl border bg-white p-5 text-sm">
              <span className="font-medium">Need a DPA, BAA, or state addendum?</span>{' '}
              <Link to="/legal/security" className="underline">See the Trust page</Link> or{' '}
              <Link to="/contact" className="underline">contact us</Link>.
            </div>
          </Reveal>
        </Container>
      </SectionBand>

      <SectionBand>
        <Container>
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Pricing FAQ</h2>
          </Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            {FAQ.map((item) => (
              <Reveal key={item.q}>
                <h3 className="text-base font-semibold">{item.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </SectionBand>
    </>
  );
}
