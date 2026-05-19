import { useState } from 'react';
import { Check } from 'lucide-react';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';
import { MockTeacherOverview } from '@/components/public/MockTeacherOverview';
import { MockActivityTimeline } from '@/components/public/MockActivityTimeline';
import { MockPromptEditor } from '@/components/public/MockPromptEditor';

type Role = 'teachers' | 'students' | 'admins';

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
            <div role="tablist" className="inline-flex rounded-full border bg-white p-1">
              {(Object.keys(TABS) as Role[]).map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={active === r}
                  onClick={() => setActive(r)}
                  className={
                    'rounded-full px-4 py-1.5 text-sm transition-colors ' +
                    (active === r
                      ? 'bg-[#0a0a0a] text-white'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {TABS[r].label}
                </button>
              ))}
            </div>
          </Reveal>
          <Reveal>
            <div className="mt-12 grid items-center gap-12 md:grid-cols-2">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{tab.title}</h2>
                <p className="mt-4 text-base text-muted-foreground md:text-lg">{tab.body}</p>
                <ul className="mt-6 space-y-2">
                  {tab.checklist.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div><Mock /></div>
            </div>
          </Reveal>
        </Container>
      </SectionBand>

      {/* Built on */}
      <SectionBand tone="dark">
        <Container>
          <Reveal>
            <div className="text-center text-xs font-medium uppercase tracking-[0.18em] text-[#a3a3a3]">
              Built on
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {['Cloudflare Workers', 'Cloudflare R2', 'Cloudflare AI Gateway', 'Anthropic Claude', 'Neon Postgres', 'Drizzle ORM', 'Hono', 'React', 'Tailwind'].map((b) => (
                <span key={b} className="rounded-full border border-[#1f1f1f] bg-[#0a0a0a] px-3 py-1 text-xs text-[#a3a3a3]">
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
