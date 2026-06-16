// Content for the public /use-cases pages. Hardcoded English like the other
// marketing pages. Grounded in real product facts (FERPA-first + COPPA handling,
// the Educators/Institutions pricing tiers, built-in quizzes/gradebook/AI
// authoring) — no invented capabilities.

export interface UseCasePoint {
  title: string;
  body: string;
}

export interface UseCaseFaq {
  q: string;
  a: string;
}

export interface UseCase {
  slug: string;
  /** Short segment label, e.g. "K-12 schools". */
  segment: string;
  /** Meta title. */
  title: string;
  /** Meta description. */
  description: string;
  /** H1 shown on the page. */
  heading: string;
  /** One-sentence positioning under the H1. */
  verdict: string;
  intro: string;
  /** Segment pain points. */
  challenges: UseCasePoint[];
  /** How CourseWise maps to those pain points. */
  solutions: UseCasePoint[];
  /** Relevant capabilities (checklist). */
  highlights: string[];
  faq: UseCaseFaq[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'k12',
    segment: 'K-12 schools',
    title: 'CourseWise for K-12 schools — FERPA & COPPA-first teaching platform',
    description:
      'A unified, FERPA- and COPPA-aware teaching platform for K-12 schools and districts: one tool for teachers, students, and admins, with admin-governed AI authoring and a signed DPA.',
    heading: 'CourseWise for K-12 schools',
    verdict:
      'One FERPA- and COPPA-aware platform for the whole school — teachers author, students learn, admins govern — with AI authoring kept under adult control.',
    intro:
      'K-12 schools handle the education records of minors and rarely have spare IT capacity. CourseWise is a managed, FERPA-first platform that unifies course operations and keeps AI authoring governed by admins — so teachers get modern tools without the school taking on extra compliance or operations risk.',
    challenges: [
      { title: 'Records of minors', body: 'Student data for under-18s (and under-13s) needs careful, defensible handling — FERPA and COPPA, not a marketing CRM in disguise.' },
      { title: 'Tool sprawl', body: 'Teachers juggle separate apps for materials, quizzes, attendance, and grades — double entry and four logins.' },
      { title: 'Thin IT staff', body: 'Most schools cannot run and maintain self-hosted LMS infrastructure.' },
      { title: 'AI anxiety', body: 'Schools want the upside of AI authoring without exposing students to ungoverned model output.' },
    ],
    solutions: [
      { title: 'FERPA- & COPPA-first', body: 'School-official mode, a signed DPA on request, an audit-ready event log, and deletion on request. See the FERPA and COPPA pages.' },
      { title: 'One tool, one model', body: 'Modules, materials, quizzes, assignments, attendance, discussions, and gradebook share a single data model — no double entry.' },
      { title: 'Fully managed', body: 'CourseWise is hosted SaaS; there is no server for the school to run or patch.' },
      { title: 'Governed AI', body: 'Admins own providers, models, cost ceilings, and prompt templates; every generation is audited and students never see raw, unrevised output.' },
    ],
    highlights: [
      'Signed DPA, FERPA-aligned record handling, deletion on request',
      'COPPA-aware handling for younger students',
      'Unified teacher / student / admin views',
      'Admin-governed AI material & quiz generation',
      'Audit log of admin actions and AI generations',
      'No infrastructure to run or maintain',
    ],
    faq: [
      { q: 'Is CourseWise FERPA compliant?', a: 'CourseWise is built FERPA-first: it operates as a school official under §99.31, signs a DPA on request, keeps an audit log, and processes deletion requests. See the FERPA page for details.' },
      { q: 'How does CourseWise handle students under 13 (COPPA)?', a: 'Younger students are covered under the school-consent model with the same FERPA-first handling; see the COPPA page and reach out for your district’s specifics.' },
      { q: 'Do students see raw AI output?', a: 'No. AI authoring is an admin- and teacher-governed drafting tool; students see reviewed material, not unrevised model output.' },
    ],
  },
  {
    slug: 'higher-ed',
    segment: 'Higher education',
    title: 'CourseWise for higher education — AI-native LMS for departments',
    description:
      'An AI-native teaching platform for higher-ed departments and colleges: deep quizzes and gradebook, admin-governed AI with full audit for academic integrity, and FERPA-first record handling.',
    heading: 'CourseWise for higher education',
    verdict:
      'An AI-native platform for departments that want modern course operations and defensible AI governance without a heavyweight LMS rollout.',
    intro:
      'Higher-ed departments often want to move faster than a campus-wide LMS migration allows, while still meeting FERPA obligations and getting AI governance right. CourseWise gives a department a complete, AI-native teaching platform with the audit trail that academic-integrity conversations require.',
    challenges: [
      { title: 'Department autonomy', body: 'Departments want to adopt modern tools without waiting on a campus-wide LMS decision.' },
      { title: 'Assessment depth', body: 'Real courses need quizzes, scheduling windows, rubrics, and a gradebook with policies — not just assignment drop-boxes.' },
      { title: 'AI & academic integrity', body: 'AI use needs to be transparent and auditable, not a black box.' },
      { title: 'Compliance', body: 'Student records still fall under FERPA regardless of which tool a department picks.' },
    ],
    solutions: [
      { title: 'Adopt at the department level', body: 'Stand up courses for a department or program without a campus-wide migration; pilots are available.' },
      { title: 'Built-in assessment', body: 'Quizzes with scheduling waves and per-student windows, assignments with rubrics, and a gradebook with grading policies.' },
      { title: 'Auditable AI', body: 'Admin-governed providers and prompt templates, with a per-generation audit log that supports academic-integrity review.' },
      { title: 'FERPA-first', body: 'School-official mode, a signed DPA, an audit log, and deletion on request.' },
    ],
    highlights: [
      'Quizzes with scheduling waves & per-student windows',
      'Assignments with rubrics and a policy-driven gradebook',
      'Attendance, discussions, and presentations built in',
      'Admin-governed AI with per-generation audit',
      'Signed DPA and FERPA-aligned record handling',
      'Department-level adoption with pilots',
    ],
    faq: [
      { q: 'Can a single department use CourseWise without the whole university?', a: 'Yes — CourseWise can be adopted at the department or program level. Pilots are typically scoped to one or two courses with a signed pilot DPA.' },
      { q: 'Does CourseWise support academic-integrity review of AI use?', a: 'AI generations are audited and admins control providers, models, and prompt templates, so AI use is transparent rather than a black box.' },
      { q: 'How deep is the gradebook?', a: 'CourseWise includes quizzes with auto-grading, assignments with rubrics, and a gradebook with configurable grading policies.' },
    ],
  },
  {
    slug: 'individual-educators',
    segment: 'Individual educators',
    title: 'CourseWise for individual educators & tutors',
    description:
      'A modern teaching workspace for individual educators and tutors: AI material and quiz generation (bring your own API key or pooled credits), a markdown editor, and a gradebook — no IT department required.',
    heading: 'CourseWise for individual educators',
    verdict:
      'A modern, AI-native workspace for solo educators and small departments running pilots — author faster, with no infrastructure to manage.',
    intro:
      'Individual educators and tutors want the productivity of AI authoring without an enterprise LMS or an IT department. The CourseWise Educators tier is built for exactly that: spin up a few courses, generate drafts with your own API key or pooled credits, and teach.',
    challenges: [
      { title: 'No IT support', body: 'Solo educators cannot run servers or manage a heavyweight LMS.' },
      { title: 'Authoring takes time', body: 'Building reading materials and quizzes by hand is slow.' },
      { title: 'Enterprise overkill', body: 'Full institutional platforms are too much tool — and too much cost — for one teacher.' },
    ],
    solutions: [
      { title: 'Start in minutes', body: 'A managed, opinionated setup — no infrastructure, no admin project.' },
      { title: 'AI drafting built in', body: 'Generate reading materials and quizzes, then refine in a markdown editor with live preview. Bring your own API key (BYOK) or use pooled credits with caps.' },
      { title: 'Right-sized', body: 'The Educators tier covers up to five courses with the core editor and gradebook — without enterprise complexity.' },
    ],
    highlights: [
      'Up to 5 courses (Educators tier)',
      'AI material & quiz generation (BYOK or pooled credits)',
      'Markdown editor with live preview',
      'Quizzes with auto-grading and a gradebook',
      'Nothing to host or maintain',
    ],
    faq: [
      { q: 'Can I bring my own AI API key?', a: 'Yes — the Educators tier supports BYOK, or you can use a pooled-credit option with usage caps. See the pricing page.' },
      { q: 'Is there a free trial?', a: 'Institutions can run a 30-day pilot; individual educators should reach out via the contact page to discuss options.' },
      { q: 'How many courses can I run?', a: 'The Educators tier covers up to five courses; larger needs are served by the Institutions tier.' },
    ],
  },
];

export function getUseCase(slug: string | undefined): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug);
}
