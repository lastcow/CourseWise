import { useState, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';
import { MockTeacherOverview } from '@/components/public/MockTeacherOverview';
import { MockActivityTimeline } from '@/components/public/MockActivityTimeline';
import { MockPromptEditor } from '@/components/public/MockPromptEditor';

type Role = 'teachers' | 'students' | 'admins';

const ROLE_ORDER: Role[] = ['teachers', 'students', 'admins'];

const TABS: Record<Role, { label: string; title: string; body: string; checklist: string[]; mock: () => JSX.Element }> = {
  teachers: {
    label: 'For teachers',
    title: 'Author your course in one workspace.',
    body: "Modules, materials, quizzes, assignments, attendance, and gradebook — all on the same data model, all wired to the same students.",
    checklist: [
      'AI reading material generation per module',
      'Markdown editor with live preview',
      'Quizzes with auto-grading',
      'Assignments with rubrics',
      'Attendance per session',
      'Discussions threaded per topic',
      'Gradebook with grading policies',
    ],
    mock: MockTeacherOverview,
  },
  students: {
    label: 'For students',
    title: 'A calmer way to keep up.',
    body: 'A clean per-course feed with everything you need — readings, quizzes, assignments, your own grades — without four logins.',
    checklist: [
      'Course feed with the latest activity',
      'Reading materials and presentations',
      'Quizzes with instant feedback',
      'Assignment submissions',
      'Personal grade dashboard',
      'Attendance history',
      'Discussion participation',
    ],
    mock: MockActivityTimeline,
  },
  admins: {
    label: 'For admins',
    title: 'The AI side of EdTech, finally legible.',
    body: 'Configure providers and models with cost ceilings; edit prompt templates per artifact kind; audit every generation; export FERPA records on demand.',
    checklist: [
      'AI provider config (Anthropic, OpenAI, …)',
      'Model allowlist with per-1M-token pricing',
      'Editable prompt templates per artifact kind',
      'Realtime activity timelines per job',
      'Audit log of every admin action',
      'User invitations and role assignment',
      'Alerts on cost or job failures',
    ],
    mock: MockPromptEditor,
  },
};

export function FeaturesPage(): JSX.Element {
  const [active, setActive] = useState<Role>('teachers');
  const tab = TABS[active];
  const Mock = tab.mock;

  function onTablistKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = ROLE_ORDER.indexOf(active);
    const next =
      e.key === 'ArrowRight'
        ? ROLE_ORDER[(i + 1) % ROLE_ORDER.length]!
        : ROLE_ORDER[(i - 1 + ROLE_ORDER.length) % ROLE_ORDER.length]!;
    setActive(next);
  }

  return (
    <>
      <SectionBand>
        <PageHeader
          eyebrow="Features"
          title="One tool, three perspectives."
          subtitle="CourseWise is a single product with three views — teacher, student, admin — that share the same data model. No SSO juggling, no double entry, no swivel chair."
        />
        <Container className="mt-12">
          <Reveal>
            <div
              role="tablist"
              aria-label="Audiences"
              onKeyDown={onTablistKeyDown}
              className="flex flex-wrap gap-1 rounded-lg border border-ink/10 bg-paper-200 p-1 sm:inline-flex"
            >
              {ROLE_ORDER.map((r) => (
                <button
                  key={r}
                  id={`features-tab-${r}`}
                  role="tab"
                  type="button"
                  aria-selected={active === r}
                  aria-controls={`features-panel-${r}`}
                  tabIndex={active === r ? 0 : -1}
                  onClick={() => setActive(r)}
                  className={
                    'rounded-md px-4 py-1.5 text-sm font-medium transition-colors ' +
                    (active === r
                      ? 'bg-ink text-paper shadow-warm-sm'
                      : 'text-ink/55 hover:bg-paper-300 hover:text-ink')
                  }
                >
                  {TABS[r].label}
                </button>
              ))}
            </div>
          </Reveal>
          <Reveal>
            <div
              role="tabpanel"
              id={`features-panel-${active}`}
              aria-labelledby={`features-tab-${active}`}
              tabIndex={0}
              className="mt-12 grid items-center gap-12 focus:outline-none lg:grid-cols-[1.05fr_1fr]"
            >
              <div>
                <h2 className="font-display text-3xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-[2.4rem]">
                  {tab.title}
                </h2>
                <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-400 md:text-lg">
                  {tab.body}
                </p>
                <ul className="mt-8 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {tab.checklist.map((c) => (
                    <li key={c} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden />
                      <span className="text-ink/80">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Mock />
              </div>
            </div>
          </Reveal>
        </Container>
      </SectionBand>

      {/* Built on */}
      <SectionBand tone="dark" grain className="!py-20">
        <Container>
          <Reveal>
            <div className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-evergreen-200">
              Built on
            </div>
            <div className="mx-auto mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-2.5">
              {['Cloudflare Workers', 'Cloudflare R2', 'Cloudflare AI Gateway', 'Anthropic Claude', 'Neon Postgres', 'Drizzle ORM', 'Hono', 'React', 'Tailwind'].map((b) => (
                <span
                  key={b}
                  className="rounded-md border border-paper/15 bg-paper/[0.04] px-3 py-1.5 text-xs text-paper/70"
                >
                  {b}
                </span>
              ))}
            </div>
          </Reveal>
        </Container>
      </SectionBand>
    </>
  );
}
