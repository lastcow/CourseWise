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

export function HomePage(): JSX.Element {
  const { t } = useTranslation();
  const { auth } = useAuth();
  if (auth) return <Navigate to="/dashboard" replace />;

  return (
    <>
      {/* 1. Hero */}
      <section className="relative overflow-hidden pb-32 pt-20 md:pt-28">
        <AuroraBackground />
        <Container className="relative">
          <Reveal>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {/* TODO(i18n) */}Course operations + AI authoring, in one place
            </div>
            <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
              {/* TODO(i18n) */}The teaching stack you wish every school had.
            </h1>
            <p className="mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
              {/* TODO(i18n) */}CourseWise unifies modules, materials, quizzes,
              attendance, and AI authoring under one FERPA-first roof. Built for
              teachers, administrators, and students who want their tools to
              actually work together.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Button asChild size="lg">
                <Link to="/register">
                  {t('public.nav.getStarted')} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/features">{/* TODO(i18n) */}See features</Link>
              </Button>
            </div>
          </Reveal>

          {/* Floating mock cards */}
          <div className="relative mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Reveal delay={0.05} className="md:rotate-[-2deg]">
              <MockTeacherOverview />
            </Reveal>
            <Reveal delay={0.1} className="md:translate-y-6">
              <MockActivityTimeline />
            </Reveal>
            <Reveal delay={0.15} className="md:rotate-[2deg]">
              <MockPromptEditor />
            </Reveal>
          </div>
        </Container>
      </section>

      {/* 2. Trust strip */}
      <SectionBand className="!py-12">
        <Container>
          <Reveal>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1">
                <Shield className="h-3.5 w-3.5 text-violet-600" /> Built FERPA-first
              </span>
              <span className="hidden md:inline">·</span>
              <span>Trusted by [placeholder institutions]</span>
            </div>
          </Reveal>
        </Container>
      </SectionBand>

      {/* 3. Value-prop trio */}
      <SectionBand>
        <Container>
          <Reveal>
            <div className="max-w-2xl">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Why CourseWise
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Honest tools for serious teaching.
              </h2>
            </div>
          </Reveal>
          <div className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-3">
            {[
              {
                icon: Sparkles,
                title: 'AI you control',
                body:
                  'Admins own the prompt templates, model choices, and cost ceilings. No vendor magic — just a transparent generation pipeline with full audit history.',
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
                  'School-official mode, signed DPA available, audit-ready event log, deletion-on-request. Procurement teams can stop holding their breath.',
              },
            ].map((v, i) => (
              <Reveal key={v.title} delay={i * 0.05}>
                <v.icon className="h-5 w-5 text-violet-600" />
                <h3 className="mt-4 text-lg font-semibold tracking-tight">{v.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{v.body}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </SectionBand>

      {/* 4. Product showcase (dark) */}
      <SectionBand tone="dark">
        <Container>
          <Reveal>
            <div className="max-w-2xl">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#a3a3a3]">
                What's inside
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                One tool, three perspectives.
              </h2>
            </div>
          </Reveal>
          <div className="mt-16 grid gap-16">
            {[
              { mock: <MockTeacherOverview />, eyebrow: 'For teachers', title: 'Author your course in one workspace.', body: 'Modules, materials, quizzes, assignments, attendance, discussions — all wired into the same gradebook. AI draft toggles on every material.' },
              { mock: <MockActivityTimeline />, eyebrow: 'For admins', title: 'Realtime visibility into every generation.', body: 'A live activity timeline streams every step — context loaded, model called, tokens used, draft saved. Failures and partial outcomes are color-coded; everything is audited.' },
              { mock: <MockPromptEditor />, eyebrow: 'For governance', title: 'Editable prompt templates per artifact kind.', body: 'Admins customize the system prompt, user message, and depth knobs. Click-to-insert variables; Reset-to-defaults restores the built-in template. Server stamps every edit.' },
            ].map((row, idx) => (
              <Reveal key={row.title}>
                <div className={`grid items-center gap-10 md:grid-cols-2 ${idx % 2 === 1 ? 'md:[&>div:first-child]:order-2' : ''}`}>
                  <div className="relative">
                    <div className="relative">
                      {row.mock}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#a3a3a3]">{row.eyebrow}</div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">{row.title}</h3>
                    <p className="mt-4 text-sm text-[#a3a3a3] md:text-base">{row.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </SectionBand>

      {/* 5. CTA band */}
      <SectionBand>
        <Container className="text-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Ready to give your school a coherent stack?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Start a workspace in 60 seconds. Talk to us when you're ready to scale to your institution.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <Button asChild size="lg">
                <Link to="/register">{t('public.nav.getStarted')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/contact">Talk to us</Link>
              </Button>
            </div>
          </Reveal>
        </Container>
      </SectionBand>
    </>
  );
}
