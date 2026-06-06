import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { AuroraBackground } from '@/components/public/AuroraBackground';
import { Reveal } from '@/components/public/Reveal';
import { MockTeacherOverview } from '@/components/public/MockTeacherOverview';
import { MockActivityTimeline } from '@/components/public/MockActivityTimeline';
import { MockPromptEditor } from '@/components/public/MockPromptEditor';
import { useAuth } from '@/lib/authContext';

const CTA = 'bg-evergreen text-paper hover:bg-evergreen-dark';

const VALUES = [
  {
    icon: Sparkles,
    title: 'AI you control',
    body:
      'Admins own the prompt templates, model choices, and cost ceilings. No vendor magic — a transparent generation pipeline with full audit history.',
  },
  {
    icon: Users,
    title: 'Every role, one tool',
    body:
      'Teachers author, students learn, admins govern — all on the same data model. No more swivel-chairing between three SaaS tabs.',
  },
  {
    icon: Shield,
    title: 'FERPA-first by design',
    body:
      'School-official mode, a signed DPA on request, an audit-ready event log, and deletion on request. Procurement can stop holding its breath.',
  },
];

const SHOWCASE = [
  {
    mock: <MockTeacherOverview />,
    eyebrow: 'For teachers',
    title: 'Author your course in one workspace.',
    body: 'Modules, materials, quizzes, assignments, attendance, discussions — all wired into the same gradebook, with an AI draft toggle on every material.',
  },
  {
    mock: <MockActivityTimeline />,
    eyebrow: 'For admins',
    title: 'Real-time visibility into every generation.',
    body: 'A live timeline streams each step — context loaded, model called, tokens used, draft saved. Failures and partial outcomes are flagged; everything is audited.',
  },
  {
    mock: <MockPromptEditor />,
    eyebrow: 'For governance',
    title: 'Editable prompt templates per artifact kind.',
    body: 'Admins tune the system prompt, the user message, and the depth knobs. Click-to-insert variables; reset restores the built-in template. The server stamps every edit.',
  },
];

export function HomePage(): JSX.Element {
  const { t } = useTranslation();
  const { auth } = useAuth();
  if (auth) return <Navigate to="/dashboard" replace />;

  return (
    <>
      {/* 1. Hero — asymmetric: copy left, layered product right */}
      <section className="relative overflow-hidden pb-24 pt-16 md:pb-32 md:pt-24">
        <AuroraBackground />
        <Container className="relative">
          <div className="grid items-center gap-14 lg:grid-cols-12">
            <Reveal className="lg:col-span-6 xl:col-span-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen">
                Course operations + AI authoring
              </div>
              <h1 className="mt-5 font-display text-[2.85rem] font-semibold leading-[1.02] tracking-[-0.025em] text-balance md:text-6xl">
                The teaching stack your school{' '}
                <em className="font-display italic text-evergreen">deserves</em>.
              </h1>
              <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-ink-400 md:text-lg">
                CourseWise unifies modules, materials, quizzes, attendance, and AI authoring under
                one FERPA-first roof — for teachers, administrators, and students who want their
                tools to actually work together.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button asChild size="lg" className={CTA}>
                  <Link to="/register">
                    {t('public.nav.getStarted')} <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Link
                  to="/features"
                  className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink transition-colors hover:text-evergreen"
                >
                  See what's inside
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </Reveal>

            {/* Layered product composition */}
            <div className="lg:col-span-6 xl:col-span-7">
              <div className="relative mx-auto max-w-xl lg:mr-0 lg:max-w-none">
                <Reveal delay={0.1}>
                  <MockTeacherOverview />
                </Reveal>
                <Reveal
                  delay={0.25}
                  className="absolute -bottom-10 -left-10 hidden w-72 lg:block xl:-left-16"
                >
                  <MockActivityTimeline />
                </Reveal>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* 2. Trust line */}
      <SectionBand className="border-y border-ink/10 !py-7">
        <Container>
          <Reveal>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center text-xs text-ink-400">
              <Shield className="h-3.5 w-3.5 text-evergreen" aria-hidden />
              <span className="font-medium text-ink">FERPA-first</span>
              <Dot />
              <span>audit-ready event log</span>
              <Dot />
              <span>signed DPA on request</span>
              <Dot />
              <span>deletion on request</span>
            </div>
          </Reveal>
        </Container>
      </SectionBand>

      {/* 3. Value props — editorial numbered list, not three equal cards */}
      <SectionBand>
        <Container>
          <div className="grid gap-12 lg:grid-cols-12">
            <Reveal className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen">
                  Why CourseWise
                </div>
                <h2 className="mt-4 font-display text-3xl font-semibold leading-[1.08] tracking-[-0.02em] md:text-[2.6rem]">
                  Honest tools for serious teaching.
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
                  No dark patterns, no black-box AI, no data you can&rsquo;t get back. Just the
                  things a teaching team actually needs, built to fit together.
                </p>
              </div>
            </Reveal>
            <div className="lg:col-span-8">
              <div className="border-t border-ink/10">
                {VALUES.map((v, i) => (
                  <Reveal key={v.title} delay={i * 0.05}>
                    <div className="grid gap-5 border-b border-ink/10 py-9 sm:grid-cols-[5rem_1fr]">
                      <div className="font-display text-2xl font-semibold tabular-nums text-evergreen">
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <v.icon className="h-5 w-5 text-evergreen" aria-hidden />
                          <h3 className="font-display text-xl font-semibold tracking-tight">
                            {v.title}
                          </h3>
                        </div>
                        <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-400">
                          {v.body}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </SectionBand>

      {/* 4. Product showcase (dark, zig-zag) */}
      <SectionBand tone="dark" grain>
        <Container>
          <Reveal>
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen-200">
                What&rsquo;s inside
              </div>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-[1.08] tracking-[-0.02em] md:text-[2.6rem]">
                One tool, three perspectives.
              </h2>
            </div>
          </Reveal>
          <div className="mt-16 grid gap-20">
            {SHOWCASE.map((row, idx) => (
              <Reveal key={row.title}>
                <div className="grid items-center gap-10 md:grid-cols-2">
                  <div className={idx % 2 === 1 ? 'md:order-2' : 'md:order-1'}>{row.mock}</div>
                  <div className={idx % 2 === 1 ? 'md:order-1' : 'md:order-2'}>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen-200">
                      {row.eyebrow}
                    </div>
                    <h3 className="mt-3 font-display text-2xl font-semibold leading-snug tracking-tight md:text-[1.9rem]">
                      {row.title}
                    </h3>
                    <p className="mt-4 max-w-prose text-sm leading-relaxed text-paper/60 md:text-base">
                      {row.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </SectionBand>

      {/* 5. CTA — evergreen panel inset on paper */}
      <SectionBand>
        <Container>
          <Reveal>
            <div className="grain relative overflow-hidden rounded-3xl bg-evergreen px-8 py-16 text-paper shadow-warm-lg md:px-16 md:py-20">
              <div
                className="pointer-events-none absolute -right-20 -top-24 h-[28rem] w-[28rem] rounded-full opacity-50 blur-3xl"
                style={{ background: 'radial-gradient(closest-side, rgba(251,250,247,0.18), rgba(251,250,247,0) 70%)' }}
                aria-hidden
              />
              <div className="relative max-w-2xl">
                <h2 className="font-display text-3xl font-semibold leading-[1.06] tracking-[-0.02em] text-balance md:text-5xl">
                  Ready to give your school a coherent stack?
                </h2>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-paper/75">
                  Start a workspace in a couple of minutes. Talk to us when you&rsquo;re ready to
                  roll it out across your institution.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Button asChild size="lg" className="bg-paper text-ink hover:bg-paper-200">
                    <Link to="/register">{t('public.nav.getStarted')}</Link>
                  </Button>
                  <Link
                    to="/contact"
                    className="group inline-flex items-center gap-1.5 text-sm font-medium text-paper/90 transition-colors hover:text-paper"
                  >
                    Talk to us
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </SectionBand>
    </>
  );
}

function Dot(): JSX.Element {
  return <span className="text-ink/40" aria-hidden>·</span>;
}
