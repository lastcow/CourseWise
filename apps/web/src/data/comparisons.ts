// Comparison content for the public /compare pages. Hardcoded English, like the
// other marketing pages (Features/Pricing/About). Claims are kept factual and
// fair: competitor strengths and CourseWise's current limitations (no self-host
// yet, paid, smaller integration surface) are stated plainly — balanced
// comparisons are both honest and more likely to be cited by AI engines.

export interface CompareRow {
  /** Dimension being compared. */
  dim: string;
  /** CourseWise's position. */
  cw: string;
  /** The competitor's position. */
  them: string;
}

export interface CompareFaq {
  q: string;
  a: string;
}

export interface Comparison {
  slug: string;
  competitor: string;
  /** Meta title. */
  title: string;
  /** Meta description. */
  description: string;
  /** One-sentence verdict shown under the H1. */
  verdict: string;
  /** Short framing paragraph. */
  intro: string;
  rows: CompareRow[];
  pickThem: string[];
  pickCw: string[];
  faq: CompareFaq[];
}

export const COMPARISONS: Comparison[] = [
  {
    slug: 'canvas',
    competitor: 'Canvas',
    title: 'CourseWise vs Canvas — comparison',
    description:
      'How CourseWise compares to Canvas (Instructure): an AI-native, FERPA-first platform with a unified teacher/student/admin model versus a comprehensive, deeply-integrated enterprise LMS.',
    verdict:
      'Canvas is the established, deeply-integrated enterprise LMS; CourseWise is a lighter, AI-native, FERPA-first alternative that unifies teaching and admin on one data model.',
    intro:
      'Canvas, by Instructure, is one of the most widely adopted learning management systems — especially in higher ed — with a deep feature set and a large integration ecosystem. CourseWise is a newer, AI-native platform that puts FERPA handling and admin-governed AI authoring at the center, with teacher, student, and admin views over a single data model. Here is an honest comparison.',
    rows: [
      { dim: 'Primary focus', cw: 'AI-native teaching + course operations on one data model', them: 'Comprehensive enterprise LMS with a broad ecosystem' },
      { dim: 'AI authoring', cw: 'Built-in material & quiz generation; admin-governed providers, models, cost ceilings, editable prompts, per-generation audit', them: 'AI features and partner integrations, often newer or add-on' },
      { dim: 'FERPA posture', cw: 'FERPA-first: school-official mode, signed DPA on request, audit log, deletion on request', them: 'FERPA-compliant; enterprise agreements available' },
      { dim: 'Unified roles', cw: 'Teacher, student, and admin share one model — no double entry', them: 'Full role/permission system; richer but heavier to configure' },
      { dim: 'Integrations', cw: 'Core built-in; integration surface still growing', them: 'Extensive — LTI, SIS, and a large third-party app ecosystem' },
      { dim: 'Hosting', cw: 'Managed SaaS (Cloudflare + Neon); no self-host yet', them: 'Hosted by Instructure; open-source core is also self-hostable' },
    ],
    pickThem: [
      'You need a comprehensive LMS with a large LTI/SIS integration ecosystem.',
      'You are a large institution with established Canvas workflows and admins.',
      'You depend on specific third-party tools that integrate with Canvas today.',
    ],
    pickCw: [
      'You want AI material and quiz authoring built in and governed by admins, not bolted on.',
      'You want teacher, student, and admin on one data model with less setup.',
      'FERPA handling — school-official mode, signed DPA, audit, deletion — is a priority.',
    ],
    faq: [
      { q: 'Is CourseWise a Canvas replacement?', a: 'For schools that want AI-native course operations with strong FERPA handling, yes. If you depend on a large catalog of Canvas-specific LTI integrations, evaluate that integration surface first.' },
      { q: 'Does CourseWise import from Canvas?', a: 'Not automatically today. Reach out through the contact page about migration help for your courses.' },
      { q: "Can CourseWise be self-hosted like Canvas's open-source core?", a: 'Not yet — CourseWise is a managed SaaS on Cloudflare and Neon. Air-gapped / self-host is on the roadmap.' },
    ],
  },
  {
    slug: 'google-classroom',
    competitor: 'Google Classroom',
    title: 'CourseWise vs Google Classroom — comparison',
    description:
      'How CourseWise compares to Google Classroom: a complete, AI-native teaching platform with quizzes, gradebook, attendance, and a signed FERPA DPA versus a free, Google-Workspace-native assignment tool.',
    verdict:
      'Google Classroom is free and excellent for Google-centric assignment flow; CourseWise adds quizzes, gradebook, attendance, discussions, and admin-governed AI authoring with a signed FERPA DPA, in one product.',
    intro:
      'Google Classroom is a free tool tightly integrated with Google Workspace for Education — great for distributing and collecting assignments. CourseWise is a fuller teaching platform: quizzes, gradebook, attendance, discussions, presentations, and admin-governed AI authoring, with FERPA-first record handling. Here is a fair comparison.',
    rows: [
      { dim: 'Primary focus', cw: 'Full course operations + AI authoring', them: 'Assignment distribution within Google Workspace' },
      { dim: 'Cost', cw: 'Paid (usage-based; pilots available)', them: 'Free with Google Workspace for Education' },
      { dim: 'AI authoring', cw: 'Built-in and admin-governed', them: 'Via Gemini / Workspace add-ons' },
      { dim: 'Gradebook, quizzes, attendance', cw: 'Built-in across the board', them: 'Basic gradebook; quizzes via Google Forms' },
      { dim: 'Ecosystem', cw: 'Standalone; integrations growing', them: 'Deep Google Workspace integration' },
      { dim: 'FERPA posture', cw: 'FERPA-first; signed DPA, audit, deletion', them: 'Covered under Google Workspace for Education terms' },
    ],
    pickThem: [
      'Your school is all-in on Google Workspace and wants a free, simple tool.',
      'Your main need is distributing and collecting assignments.',
      'You do not need a deep gradebook, attendance, or governed AI authoring.',
    ],
    pickCw: [
      'You want quizzes, gradebook, attendance, and discussions in one product.',
      'You want AI authoring with admin governance and an audit trail.',
      'You want a signed DPA and FERPA-first record handling from the vendor.',
    ],
    faq: [
      { q: 'Is CourseWise free like Google Classroom?', a: 'No — CourseWise is paid (usage-based, with pilots) and includes a fuller feature set and a signed DPA. See the pricing page.' },
      { q: 'Does CourseWise work with Google sign-in?', a: 'SSO options are part of institution plans; contact us about your identity provider.' },
      { q: 'Can we use both?', a: 'Some schools run Classroom for Google-native flows and CourseWise for AI authoring and FERPA-governed operations.' },
    ],
  },
  {
    slug: 'moodle',
    competitor: 'Moodle',
    title: 'CourseWise vs Moodle — comparison',
    description:
      'How CourseWise compares to Moodle: a managed, AI-native, FERPA-first SaaS versus a self-hosted, open-source, endlessly customizable LMS.',
    verdict:
      'Moodle is open-source and endlessly customizable if you have the operational capacity; CourseWise is a managed, AI-native, FERPA-first platform with far less to run.',
    intro:
      'Moodle is a mature, open-source LMS you can self-host and customize without license fees — powerful if you have the technical capacity to run and maintain it. CourseWise is a managed SaaS that is AI-native and FERPA-first, trading Moodle’s infinite customizability for less operational burden and built-in governed AI. Here is an honest comparison.',
    rows: [
      { dim: 'Licensing & cost', cw: 'Paid managed SaaS (usage-based)', them: 'Open-source (no license fee); you pay for hosting and ops' },
      { dim: 'Hosting & ops', cw: 'Fully managed; nothing to run', them: 'Self-host or partner-host; you own upgrades, plugins, scaling' },
      { dim: 'Customizability', cw: 'Opinionated and fast to adopt', them: 'Extremely customizable via plugins and themes' },
      { dim: 'AI authoring', cw: 'Built-in and admin-governed', them: 'Via plugins; varies by setup' },
      { dim: 'FERPA posture', cw: 'FERPA-first; signed DPA, audit, deletion', them: 'Depends on your hosting and configuration' },
      { dim: 'Data residency / self-host', cw: 'Managed only (self-host on roadmap)', them: 'Full control — self-host anywhere' },
    ],
    pickThem: [
      'You want full control, data residency, or to self-host with no license fee.',
      'You have technical staff to run upgrades, plugins, and scaling.',
      'You need deep customization via Moodle’s plugin ecosystem.',
    ],
    pickCw: [
      'You would rather not run and maintain LMS infrastructure.',
      'You want governed AI authoring and FERPA handling out of the box.',
      'You want a fast, opinionated setup over endless configuration.',
    ],
    faq: [
      { q: 'Can I self-host CourseWise like Moodle?', a: 'Not yet — CourseWise is managed SaaS on Cloudflare and Neon. Air-gapped / self-host is on the roadmap; tell us if it gates a purchase.' },
      { q: 'Is CourseWise cheaper than Moodle?', a: 'Moodle has no license fee but real hosting and ops costs. CourseWise is paid but fully managed — compare total cost of ownership, not just license.' },
      { q: 'Does CourseWise have a plugin ecosystem like Moodle?', a: "Not to Moodle's extent. CourseWise focuses on a cohesive built-in feature set with governed AI." },
    ],
  },
];

export function getComparison(slug: string | undefined): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
