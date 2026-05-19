# Public Site Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the placeholder public surface with a full five-page bold tech-forward marketing site plus twelve FERPA-oriented legal pages, all sharing a cohesive shell and visual system.

**Architecture:** A new `PublicLayout` (replacing the vestigial `Layout`) wraps every marketing, legal, and auth route. Marketing pages compose mocked product UI cards over alternating light/dark bands with a violet→cyan accent and an aurora hero. Legal pages share a `LegalLayout` with a sticky sub-rail, `Last updated/Version` header, draft banner, and prose-styled body. Framer Motion handles on-scroll reveals (with `prefers-reduced-motion` honored); `@tailwindcss/typography` styles long-form prose. Marketing/legal copy ships English-only for v1 with a TODO for zh-CN translation; UI chrome (nav, footer, buttons) is i18n'd in both locales.

**Tech Stack:** React Router v6, TanStack Query, Tailwind v3 with `tailwindcss-animate` + `@tailwindcss/typography`, Framer Motion, lucide-react, react-i18next.

**Design reference:** `docs/plans/2026-05-19-public-site-redesign-design.md`

---

## Notes for the implementer

- **Frequent commits:** one commit per task. Don't squash.
- **No new tests:** the existing `App.test.tsx` smoke test is the only frontend test and the plan stays inside that convention. Manual browser smoke is the verification path on marketing pages.
- **i18n discipline:** structural UI (nav, footer, button labels, form labels, validation, page titles) goes through `t(...)`. Marketing body copy and legal prose ship as English JSX literals with `// TODO(i18n)` markers — the user/translator can lift them into the bundles later. Don't try to translate body copy yourself.
- **Routes that move:** `/login`, `/register`, `/teacher/accept-invite`, `/` get rewrapped under `<PublicLayout />` (replacing the old `<Layout />`). The old `Layout.tsx` is deleted in Task 14 after every route is migrated.
- **TypeScript strictness:** the repo uses `noUnusedLocals: true`. Don't leave unused imports.
- **Pricing numbers are placeholders:** `$X / teacher / month` and `$Y / student / year` are literal `X`/`Y` in code with a `TODO_SET_PRICING` comment so future find-and-replace catches every site.

---

## Task 1 — Add Framer Motion and the typography plugin

**Files:**
- Modify: `apps/web/package.json` (add dependencies)
- Modify: `apps/web/tailwind.config.ts` (register typography plugin)

**Step 1: Install dependencies**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web
pnpm add framer-motion@^11
pnpm add -D @tailwindcss/typography@^0.5
```

(Framer Motion v11 is current; `@tailwindcss/typography` is the `prose` class plugin.)

**Step 2: Register the typography plugin in `tailwind.config.ts`**

Find the existing `plugins: [animate]` line and change to:

```ts
import animate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';
// ...
plugins: [animate, typography],
```

**Step 3: Verify**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web
pnpm typecheck   # 0 errors
pnpm test        # App smoke passes
```

**Step 4: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/tailwind.config.ts
git commit -m "feat(web): add framer-motion + @tailwindcss/typography"
```

(`pnpm-lock.yaml` lives at the workspace root, not in `apps/web`. Stage `pnpm-lock.yaml` from the repo root.)

---

## Task 2 — Shared visual primitives

**Files:**
- Create: `apps/web/src/components/public/Container.tsx`
- Create: `apps/web/src/components/public/SectionBand.tsx`
- Create: `apps/web/src/components/public/PageHeader.tsx`
- Create: `apps/web/src/components/public/AuroraBackground.tsx`
- Create: `apps/web/src/components/public/Reveal.tsx`

**Step 1: `Container.tsx`** — narrow wrapper with the standard horizontal padding and 1280px max-width.

```tsx
import { cn } from '@/lib/utils';

export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('mx-auto max-w-[1280px] px-6 md:px-10', className)}>{children}</div>
  );
}
```

**Step 2: `SectionBand.tsx`** — light/dark surface band with consistent vertical rhythm.

```tsx
import { cn } from '@/lib/utils';

type Props = {
  tone?: 'light' | 'dark';
  children: React.ReactNode;
  className?: string;
};

export function SectionBand({ tone = 'light', children, className }: Props): JSX.Element {
  return (
    <section
      className={cn(
        'py-24 md:py-32',
        tone === 'dark'
          ? 'bg-[#0a0a0a] text-[#fafafa]'
          : 'bg-[#fafafa] text-[#0a0a0a]',
        className,
      )}
    >
      {children}
    </section>
  );
}
```

**Step 3: `PageHeader.tsx`** — standard marketing/legal page heading block.

```tsx
import { Container } from './Container';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
};

export function PageHeader({ eyebrow, title, subtitle, align = 'left' }: Props): JSX.Element {
  return (
    <Container className={align === 'center' ? 'text-center' : ''}>
      {eyebrow ? (
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </div>
      ) : null}
      <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl leading-[1.05]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
          {subtitle}
        </p>
      ) : null}
    </Container>
  );
}
```

**Step 4: `AuroraBackground.tsx`** — fixed-position blurred radial-gradient mesh. Static for v1 (the design said "slow shifting" — we can animate via Framer in a later polish task).

```tsx
export function AuroraBackground(): JSX.Element {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute -left-32 -top-40 h-[42rem] w-[42rem] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(124,58,237,0.55), rgba(124,58,237,0) 70%)',
        }}
      />
      <div
        className="absolute -right-24 top-24 h-[36rem] w-[36rem] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(6,182,212,0.55), rgba(6,182,212,0) 70%)',
        }}
      />
    </div>
  );
}
```

**Step 5: `Reveal.tsx`** — on-scroll opacity + 4px translate reveal, with `prefers-reduced-motion` honored.

```tsx
import { motion, useReducedMotion } from 'framer-motion';

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

**Step 6: Typecheck & commit**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/components/public/
git commit -m "feat(web): visual primitives (Container, SectionBand, PageHeader, AuroraBackground, Reveal)"
```

---

## Task 3 — `PublicLayout` with top nav + mega footer

**Files:**
- Create: `apps/web/src/components/public/PublicLayout.tsx`
- Create: `apps/web/src/components/public/PublicHeader.tsx`
- Create: `apps/web/src/components/public/FooterMega.tsx`

**Step 1: `PublicHeader.tsx`** — sticky, transparent on scroll-top, white-bg-with-border once scrolled.

```tsx
import { Link, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/lib/authContext';
import { Container } from './Container';
import { cn } from '@/lib/utils';

const ITEMS: { to: string; label: string }[] = [
  { to: '/features', label: 'public.nav.features' },
  { to: '/pricing', label: 'public.nav.pricing' },
  { to: '/about', label: 'public.nav.about' },
];

export function PublicHeader(): JSX.Element {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header
      className={cn(
        'sticky top-0 z-30 transition-colors',
        scrolled ? 'border-b bg-white/80 backdrop-blur' : 'bg-transparent',
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" className="text-base font-semibold tracking-tight">
          {t('app.name')}
        </Link>
        <nav className="hidden items-center gap-2 text-sm md:flex">
          {ITEMS.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                cn('px-3 py-1.5 rounded-md hover:bg-black/5', isActive && 'text-foreground font-medium')
              }
            >
              {t(i.label)}
            </NavLink>
          ))}
          <LanguageSwitcher />
          {auth ? (
            <Button asChild size="sm">
              <Link to="/dashboard">{t('public.nav.dashboard')}</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/login">{t('public.nav.signin')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">{t('public.nav.getStarted')}</Link>
              </Button>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}
```

**Step 2: `FooterMega.tsx`** — four columns + bottom row.

```tsx
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Container } from './Container';

const COLUMNS: { headingKey: string; links: { to: string; labelKey: string }[] }[] = [
  {
    headingKey: 'public.footer.product',
    links: [
      { to: '/features', labelKey: 'public.nav.features' },
      { to: '/pricing', labelKey: 'public.nav.pricing' },
    ],
  },
  {
    headingKey: 'public.footer.company',
    links: [
      { to: '/about', labelKey: 'public.nav.about' },
      { to: '/contact', labelKey: 'public.nav.contact' },
    ],
  },
  {
    headingKey: 'public.footer.trust',
    links: [
      { to: '/legal/security', labelKey: 'public.legal.security' },
      { to: '/legal/subprocessors', labelKey: 'public.legal.subprocessors' },
      { to: '/legal/dpa', labelKey: 'public.legal.dpa' },
      { to: '/legal/responsible-disclosure', labelKey: 'public.legal.responsibleDisclosure' },
    ],
  },
  {
    headingKey: 'public.footer.legal',
    links: [
      { to: '/legal/privacy', labelKey: 'public.legal.privacy' },
      { to: '/legal/terms', labelKey: 'public.legal.terms' },
      { to: '/legal/ferpa', labelKey: 'public.legal.ferpa' },
      { to: '/legal/coppa', labelKey: 'public.legal.coppa' },
      { to: '/legal/accessibility', labelKey: 'public.legal.accessibility' },
      { to: '/legal/cookies', labelKey: 'public.legal.cookies' },
      { to: '/legal/state-addenda', labelKey: 'public.legal.stateAddenda' },
      { to: '/legal/data-requests', labelKey: 'public.legal.dataRequests' },
    ],
  },
];

export function FooterMega(): JSX.Element {
  const { t } = useTranslation();
  return (
    <footer className="border-t bg-[#fafafa]">
      <Container className="py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="text-base font-semibold tracking-tight">{t('app.name')}</div>
            <p className="mt-3 max-w-xs text-xs text-muted-foreground">
              {t('public.footer.blurb')}
            </p>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.headingKey}>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t(c.headingKey)}
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {c.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="hover:underline">
                      {t(l.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t pt-6 text-xs text-muted-foreground md:flex-row md:items-center">
          <div>
            © {new Date().getFullYear()} {t('app.name')}.{' '}
            {t('public.footer.rights')}
          </div>
          <LanguageSwitcher />
        </div>
      </Container>
    </footer>
  );
}
```

**Step 3: `PublicLayout.tsx`** — composes header + outlet + footer.

```tsx
import { Outlet } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { FooterMega } from './FooterMega';

export function PublicLayout(): JSX.Element {
  return (
    <div className="min-h-screen bg-white text-[#0a0a0a]">
      <PublicHeader />
      <main>
        <Outlet />
      </main>
      <FooterMega />
    </div>
  );
}
```

**Step 4: i18n keys** — add structural keys to `en.ts` (and stub them in `zh-CN.ts`):

```ts
public: {
  nav: {
    features: 'Features',
    pricing: 'Pricing',
    about: 'About',
    contact: 'Contact',
    signin: 'Sign in',
    getStarted: 'Get started',
    dashboard: 'Dashboard',
  },
  footer: {
    product: 'Product',
    company: 'Company',
    trust: 'Trust',
    legal: 'Legal',
    blurb: 'Course operations and AI authoring, in one place. Built FERPA-first.',
    rights: 'All rights reserved.',
  },
  legal: {
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    ferpa: 'FERPA Statement',
    subprocessors: 'Subprocessors',
    coppa: 'COPPA Notice',
    security: 'Security & Trust',
    dataRequests: 'Data Requests',
    accessibility: 'Accessibility',
    cookies: 'Cookies',
    stateAddenda: 'State Addenda',
    dpa: 'Data Processing Addendum',
    responsibleDisclosure: 'Responsible Disclosure',
  },
},
```

For `zh-CN.ts`, translate at least the **nav** and **footer headings** (small set). Legal page titles can be the same in both for now with a TODO marker (since the legal body copy is English-only in v1, the link labels staying English is consistent).

Actually translate everything in this block in zh-CN to match (it's small):
```ts
public: {
  nav: {
    features: '功能',
    pricing: '定价',
    about: '关于',
    contact: '联系',
    signin: '登录',
    getStarted: '免费开始',
    dashboard: '工作台',
  },
  footer: {
    product: '产品',
    company: '公司',
    trust: '信任',
    legal: '法律',
    blurb: '课程运营与 AI 创作,一站搞定。FERPA 优先设计。',
    rights: '保留所有权利。',
  },
  legal: {
    privacy: '隐私政策',
    terms: '服务条款',
    ferpa: 'FERPA 声明',
    subprocessors: '子处理方',
    coppa: 'COPPA 公告',
    security: '安全与信任',
    dataRequests: '数据请求',
    accessibility: '无障碍声明',
    cookies: 'Cookies',
    stateAddenda: '美国各州附录',
    dpa: '数据处理附录',
    responsibleDisclosure: '漏洞披露',
  },
},
```

**Step 5: Typecheck & commit**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/components/public/ apps/web/src/locales/
git commit -m "feat(web): PublicLayout with sticky header and mega footer"
```

---

## Task 4 — Wire public routes to `PublicLayout`; remove old `Layout`

**Files:**
- Modify: `apps/web/src/App.tsx`
- Delete: `apps/web/src/components/Layout.tsx`

**Step 1: Update `App.tsx`** to use `PublicLayout` for the public routes (which currently include `/`, `/login`, `/register`, `/teacher/accept-invite`). Add placeholder routes for the new pages that Tasks 5–11 will fill in — point them at a small `<PlaceholderPage title="..." />` so the navigation works end-to-end before the content lands.

```tsx
import { PublicLayout } from '@/components/public/PublicLayout';
// remove: import { Layout } from '@/components/Layout';

// inside <Routes>:
<Route element={<PublicLayout />}>
  <Route path="/" element={<HomePage />} />
  <Route path="/features" element={<FeaturesPage />} />
  <Route path="/pricing" element={<PricingPage />} />
  <Route path="/about" element={<AboutPage />} />
  <Route path="/contact" element={<ContactPage />} />
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />
  <Route path="/teacher/accept-invite" element={<TeacherAcceptInvitePage />} />
  <Route path="/legal/*" element={<LegalRoutes />} />
</Route>
```

Create stub files where needed so the imports compile:

- `apps/web/src/pages/public/FeaturesPage.tsx`
- `apps/web/src/pages/public/PricingPage.tsx`
- `apps/web/src/pages/public/AboutPage.tsx`
- `apps/web/src/pages/public/ContactPage.tsx`
- `apps/web/src/pages/legal/LegalRoutes.tsx`

Each stub returns a one-liner heading using `PageHeader` so the router works:

```tsx
import { PageHeader } from '@/components/public/PageHeader';
import { SectionBand } from '@/components/public/SectionBand';
export function FeaturesPage(): JSX.Element {
  return (
    <SectionBand>
      <PageHeader title="Features" subtitle="Coming soon." />
    </SectionBand>
  );
}
```

`LegalRoutes.tsx` is a nested-routes wrapper that Tasks 12+ will flesh out. For now stub it:

```tsx
import { Routes, Route } from 'react-router-dom';
import { PageHeader } from '@/components/public/PageHeader';
import { SectionBand } from '@/components/public/SectionBand';
export function LegalRoutes(): JSX.Element {
  return (
    <Routes>
      <Route
        path="*"
        element={
          <SectionBand>
            <PageHeader title="Legal" subtitle="Coming soon." />
          </SectionBand>
        }
      />
    </Routes>
  );
}
```

**Step 2: Delete `apps/web/src/components/Layout.tsx`** — its sole consumer was the public-route wrapper that we just replaced. Confirm via `grep -rn "components/Layout" apps/web/src` returns no other references.

**Step 3: Verify**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck && pnpm test
```

Manual: `pnpm dev`, hit `/`, `/features`, `/pricing`, `/about`, `/contact`, `/legal/anything` — each should render the new header + footer with the stub PageHeader.

**Step 4: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/App.tsx apps/web/src/components/Layout.tsx apps/web/src/pages/public/ apps/web/src/pages/legal/
git commit -m "feat(web): wire public routes through PublicLayout; remove old Layout"
```

---

## Task 5 — Mock product UI cards

**Files:**
- Create: `apps/web/src/components/public/MockTeacherOverview.tsx`
- Create: `apps/web/src/components/public/MockActivityTimeline.tsx`
- Create: `apps/web/src/components/public/MockPromptEditor.tsx`
- Create: `apps/web/src/components/public/AnnotatedCallout.tsx`

Each mock is a self-contained presentational component that **looks like** a screenshot of the real product — composed entirely of HTML/CSS, no real data. Use neutral grayscale + restrained accent so they read as UI, not as decoration.

**Step 1: `MockTeacherOverview.tsx`** — a card emulating the teacher course overview, with a header row (course title + badge), an enrollment count, a list of modules, and an "AI draft" badge on one item.

```tsx
import { GraduationCap, Sparkles } from 'lucide-react';

export function MockTeacherOverview(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-2xl shadow-black/5 ring-1 ring-black/5">
      <div className="border-b bg-gray-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GraduationCap className="h-3.5 w-3.5" />
          Teacher · Course overview
        </div>
        <div className="mt-1 text-base font-semibold">Introduction to Software Economics</div>
      </div>
      <div className="grid grid-cols-3 gap-3 px-4 py-4 text-xs">
        <div>
          <div className="text-muted-foreground">Enrollments</div>
          <div className="mt-1 text-lg font-semibold">128</div>
        </div>
        <div>
          <div className="text-muted-foreground">Modules</div>
          <div className="mt-1 text-lg font-semibold">14</div>
        </div>
        <div>
          <div className="text-muted-foreground">Materials</div>
          <div className="mt-1 text-lg font-semibold">42</div>
        </div>
      </div>
      <ul className="divide-y border-t text-sm">
        {[
          { title: 'Markets and prices', ai: false },
          { title: 'Supply and demand', ai: true },
          { title: 'Elasticity and welfare', ai: false },
        ].map((m) => (
          <li key={m.title} className="flex items-center justify-between px-4 py-2.5">
            <div className="truncate">{m.title}</div>
            {m.ai ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                <Sparkles className="h-3 w-3" /> AI draft
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Step 2: `MockActivityTimeline.tsx`** — emulates the realtime activity timeline. Header bar with "Activity" + "Show live activity" toggle. Three rows with dots (info=blue, success=blue, info=blue, the last "running" one with a pulse).

```tsx
import { Activity } from 'lucide-react';

const ENTRIES = [
  { dot: 'bg-blue-500', label: 'Job started', meta: 'Starting reading-material generation for 1 module', ts: 'just now' },
  { dot: 'bg-blue-500', label: 'Context loaded', meta: 'Loaded course context (2,140 chars)', ts: '2s ago' },
  { dot: 'bg-blue-500', label: 'Calling model', meta: 'Calling claude-sonnet-4-5 for module "Supply and demand"', ts: '4s ago' },
];

export function MockActivityTimeline(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-2xl shadow-black/5 ring-1 ring-black/5">
      <div className="flex items-center justify-between border-b bg-gray-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          Activity
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" defaultChecked className="h-3 w-3" /> Show live activity
        </label>
      </div>
      <ul className="space-y-1.5 px-4 py-4 text-xs">
        {ENTRIES.map((e, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.dot}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{e.label}</span>
                <span className="text-muted-foreground">{e.meta}</span>
                <span className="ml-auto text-muted-foreground">{e.ts}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Step 3: `MockPromptEditor.tsx`** — emulates the new prompt template card: tabs row, system-prompt textarea-like area, variable chips on the right.

```tsx
import { FileText } from 'lucide-react';

const VARS = ['course.title', 'moduleSummary', 'wordTarget', 'language'];

export function MockPromptEditor(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-2xl shadow-black/5 ring-1 ring-black/5">
      <div className="border-b bg-gray-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Admin · Prompt templates
        </div>
        <div className="mt-2 flex gap-1.5 text-[11px]">
          {['Reading material', 'Presentation', 'Assignment'].map((k, i) => (
            <span
              key={k}
              className={
                'rounded-full border px-2 py-0.5 ' +
                (i === 0
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'text-muted-foreground')
              }
            >
              {k}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_140px] gap-3 px-4 py-4 text-xs">
        <div>
          <div className="text-muted-foreground">System prompt</div>
          <pre className="mt-1.5 max-h-32 overflow-hidden rounded border bg-gray-50/60 p-2 font-mono text-[10px] leading-relaxed">
{`You are a curriculum-design
assistant for {{course.title}}.
Target length: {{wordTarget}}.
{{language}}`}
          </pre>
        </div>
        <div>
          <div className="text-muted-foreground">Variables</div>
          <ul className="mt-1.5 space-y-1">
            {VARS.map((v) => (
              <li key={v}>
                <code className="rounded border bg-gray-50/60 px-1.5 py-0.5 text-[10px]">{`{{${v}}}`}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: `AnnotatedCallout.tsx`** — a small label + 1px hairline that visually annotates a feature of a mock. Used in the Home product-showcase band.

```tsx
import { cn } from '@/lib/utils';

type Props = {
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  label: string;
  className?: string;
};

export function AnnotatedCallout({ position, label, className }: Props): JSX.Element {
  const map: Record<Props['position'], string> = {
    'top-right': 'top-3 right-3 text-right',
    'top-left': 'top-3 left-3 text-left',
    'bottom-right': 'bottom-3 right-3 text-right',
    'bottom-left': 'bottom-3 left-3 text-left',
  };
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10 text-[10px] uppercase tracking-[0.18em] text-muted-foreground',
        map[position],
        className,
      )}
    >
      {label}
    </div>
  );
}
```

**Step 5: Typecheck + commit**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/components/public/Mock*.tsx apps/web/src/components/public/AnnotatedCallout.tsx
git commit -m "feat(web): mock product UI cards + annotated callout helper"
```

---

## Task 6 — Marketing Home page

**Files:**
- Modify: `apps/web/src/pages/HomePage.tsx`

**Step 1: Compose the five bands.**

Replace the existing `HomePage.tsx` (the 25-line stub) with the bold tech-forward landing. Keep the `if (auth) <Navigate to="/dashboard" />` redirect at the top so signed-in users still go to the back office.

```tsx
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
import { AnnotatedCallout } from '@/components/public/AnnotatedCallout';
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
```

**Step 2: Verify**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck && pnpm test
```

Manual browser smoke: home page should render the hero with floating cards, the trust strip, value-prop trio, the dark product showcase with three alternating rows, and the CTA band. On a narrow viewport everything should stack to one column.

**Step 3: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/pages/HomePage.tsx
git commit -m "feat(web): bold tech-forward landing page"
```

---

## Task 7 — Features page

**Files:**
- Modify: `apps/web/src/pages/public/FeaturesPage.tsx`

Implement the role-tabs design with three tabs (Teachers, Students, Admins). Each tab renders a 2-column grid: copy + checklist on one side, a relevant mock UI card on the other. Below the tabs, a "Built on" rail with logo-text chips (no images: just hairline-bordered text chips reading "Cloudflare Workers", "Anthropic Claude", "Neon Postgres", "R2", etc.).

**Step 1: Implementation** — full code in the file. Keep the file under ~250 lines. Use `useState` for the tab state. Use the existing mock components for the right column. Each tab's checklist has 5–7 items — for teachers: AI material generation, modules, quizzes, assignments, attendance, gradebook, discussions; for students: course feed, materials, presentations, assignments, quizzes, grades, attendance; for admins: provider config, model allowlist, prompt templates, audit log, user invites, alerts, billing visibility.

```tsx
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
```

**Step 2: Verify + commit**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/pages/public/FeaturesPage.tsx
git commit -m "feat(web): Features page with role tabs"
```

---

## Task 8 — Pricing page

**Files:**
- Modify: `apps/web/src/pages/public/PricingPage.tsx`

Two-tier card layout with FAQ below. Numbers are placeholders.

```tsx
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

const FAQ = [
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
```

**Step 2: Verify + commit**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/pages/public/PricingPage.tsx
git commit -m "feat(web): Pricing page with two tiers and FAQ"
```

---

## Task 9 — About page

**Files:**
- Modify: `apps/web/src/pages/public/AboutPage.tsx`

Three short bands: Mission, What we believe, Team.

```tsx
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
      <SectionBand tone="dark">
        <Container>
          <Reveal>
            <div className="max-w-2xl">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#a3a3a3]">What we believe</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Three stances that drive the product.</h2>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {BELIEFS.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.05}>
                <h3 className="text-lg font-semibold tracking-tight">{b.title}</h3>
                <p className="mt-2 text-sm text-[#a3a3a3]">{b.body}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </SectionBand>
      <SectionBand>
        <Container>
          <Reveal>
            <div className="max-w-2xl">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Team</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">A small team building in the open.</h2>
              <p className="mt-4 text-base text-muted-foreground md:text-lg">
                We ship in small commits and publish our roadmap publicly. The codebase, the migrations,
                and the open issues are visible on GitHub. The fastest way to influence what we build next
                is to email us.
              </p>
            </div>
          </Reveal>
        </Container>
      </SectionBand>
    </>
  );
}
```

**Step 2: Verify + commit**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/pages/public/AboutPage.tsx
git commit -m "feat(web): About page"
```

---

## Task 10 — Contact page + stub `POST /api/contact` endpoint

**Files:**
- Modify: `apps/web/src/pages/public/ContactPage.tsx`
- Modify: `packages/shared/src/validators.ts` (add `contactMessageSchema`)
- Create: `apps/api/src/routes/contact.ts`
- Modify: `apps/api/src/index.ts` (mount the new route)

**Step 1: Add the shared Zod schema.**

In `packages/shared/src/validators.ts`, add:

```ts
export const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  institution: z.string().trim().max(200).optional(),
  subject: z.enum(['sales', 'support', 'press', 'other']),
  message: z.string().trim().min(10).max(4000),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
```

**Step 2: API stub route.**

Create `apps/api/src/routes/contact.ts`:

```ts
import { Hono } from 'hono';
import { contactMessageSchema, type ContactMessageInput } from '@coursewise/shared';
import { success } from '../lib/response';
import { validateJson } from '../middleware/validate';
import type { AppEnv } from '../types';

const contact = new Hono<AppEnv>();

contact.post('/contact', validateJson(contactMessageSchema), async (c) => {
  const input = c.get('validated') as ContactMessageInput;
  // For now we just log. A follow-up task wires a real email pipeline.
  console.log('contact.message', {
    subject: input.subject,
    email: input.email,
    institution: input.institution ?? null,
    messageLength: input.message.length,
  });
  return success(c, { received: true });
});

export default contact;
```

Mount in `apps/api/src/index.ts` — find where other routes are mounted (search for `.route(`) and add:

```ts
import contact from './routes/contact';
// ...
app.route('/api', contact);
```

The route is intentionally **public** (no `requireAuth`). Rate-limiting comes later.

**Step 3: Contact page UI.**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { contactMessageSchema, type ContactMessageInput } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { PageHeader } from '@/components/public/PageHeader';
import { Reveal } from '@/components/public/Reveal';
import { useToast } from '@/components/ui/toast';
import { apiCall } from '@/lib/api';

export function ContactPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const candidate = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      institution: String(form.get('institution') ?? '') || undefined,
      subject: String(form.get('subject') ?? 'sales'),
      message: String(form.get('message') ?? ''),
    };
    const parsed = contactMessageSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.push({ title: 'Please complete all required fields.', tone: 'error' });
      return;
    }
    setPending(true);
    try {
      await apiCall<{ received: boolean }>('/api/contact', { method: 'POST', body: parsed.data });
      setDone(true);
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SectionBand>
        <PageHeader
          eyebrow="Contact"
          title="We answer fast."
          subtitle="Pick the right intake — sales and product questions here, FERPA record requests below."
        />
        <Container className="mt-12 grid gap-12 md:grid-cols-[1fr_360px]">
          <Reveal>
            {done ? (
              <div className="rounded-2xl border bg-white p-8 text-center">
                <h2 className="text-xl font-semibold">Thanks — we got it.</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  We respond within 1 business day during the school year. For urgent matters, reach us directly.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border bg-white p-8">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="c-name">Name</Label>
                    <Input id="c-name" name="name" required maxLength={120} />
                  </div>
                  <div>
                    <Label htmlFor="c-email">Email</Label>
                    <Input id="c-email" name="email" type="email" required maxLength={200} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="c-inst">Institution (optional)</Label>
                  <Input id="c-inst" name="institution" maxLength={200} />
                </div>
                <div>
                  <Label htmlFor="c-subject">Reason</Label>
                  <select id="c-subject" name="subject" required
                    className="flex h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="sales">Sales / general</option>
                    <option value="support">Existing customer support</option>
                    <option value="press">Press</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="c-msg">Message</Label>
                  <Textarea id="c-msg" name="message" required rows={6} maxLength={4000} />
                </div>
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? 'Sending…' : 'Send message'}
                </Button>
              </form>
            )}
          </Reveal>
          <aside className="space-y-6 text-sm text-muted-foreground">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em]">Response time</div>
              <p className="mt-2">1 business day during the school year. 3 business days during summer and holiday breaks.</p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em]">FERPA data requests</div>
              <p className="mt-2">
                If you're a parent, eligible student, or institutional records officer requesting inspection, amendment, or deletion of education records, use the dedicated intake:{' '}
                <Link to="/legal/data-requests" className="underline">Data Requests</Link>.
              </p>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em]">Security disclosure</div>
              <p className="mt-2">
                Report vulnerabilities via <Link to="/legal/responsible-disclosure" className="underline">Responsible Disclosure</Link>. We honor a 90-day safe harbor.
              </p>
            </div>
          </aside>
        </Container>
      </SectionBand>
    </>
  );
}
```

**Step 4: Verify**

```bash
cd /Users/zhijiangchen/CourseWise/apps/api && pnpm typecheck && pnpm test
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck
```

Manual: hit `/contact`, submit with valid data; should log to the worker console and show the success state.

**Step 5: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add packages/shared/src/validators.ts apps/api/src/routes/contact.ts apps/api/src/index.ts apps/web/src/pages/public/ContactPage.tsx
git commit -m "feat(web): Contact page + stub /api/contact endpoint"
```

---

## Task 11 — Restyle Login / Register / TeacherAcceptInvite

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Modify: `apps/web/src/pages/RegisterPage.tsx`
- Modify: `apps/web/src/pages/TeacherAcceptInvitePage.tsx`

Keep the form logic unchanged; reshape the layouts. Wrap each page in a `SectionBand`, center the form in a `max-w-md rounded-2xl border bg-white p-8` card with a clear `PageHeader`. Add a small "Why CourseWise?" link on Register pointing to `/features`.

For each file, leave the existing hooks/mutations alone — only change the JSX wrapper.

**Step 1–3:** apply the three restyles file by file. Run typecheck after each. (If the existing files include logic you don't recognize, leave it intact and only change layout/copy.)

**Step 4: Commit**

```bash
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/pages/LoginPage.tsx apps/web/src/pages/RegisterPage.tsx apps/web/src/pages/TeacherAcceptInvitePage.tsx
git commit -m "feat(web): restyle auth pages on the new public shell"
```

---

## Task 12 — Legal foundation: `LegalLayout` + `LegalSidebar` + `DraftBanner`

**Files:**
- Create: `apps/web/src/components/legal/LegalLayout.tsx`
- Create: `apps/web/src/components/legal/LegalSidebar.tsx`
- Create: `apps/web/src/components/legal/DraftBanner.tsx`
- Create: `apps/web/src/components/legal/LegalPageHeader.tsx`
- Modify: `apps/web/src/pages/legal/LegalRoutes.tsx`

**Step 1: `DraftBanner.tsx`** — gated by a build-time flag.

```tsx
const LEGAL_DRAFT = true; // flip to false when counsel signs off
export function DraftBanner(): JSX.Element | null {
  if (!LEGAL_DRAFT) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 text-amber-900">
      <div className="mx-auto max-w-[1280px] px-6 py-2 text-xs md:px-10">
        <strong>Template — not legal advice.</strong> Edit before publishing. Have legal counsel review.
      </div>
    </div>
  );
}
```

**Step 2: `LegalSidebar.tsx`** — sticky on desktop, `<select>` on mobile.

```tsx
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export const LEGAL_PAGES = [
  { to: '/legal/privacy', labelKey: 'public.legal.privacy' },
  { to: '/legal/terms', labelKey: 'public.legal.terms' },
  { to: '/legal/ferpa', labelKey: 'public.legal.ferpa' },
  { to: '/legal/subprocessors', labelKey: 'public.legal.subprocessors' },
  { to: '/legal/coppa', labelKey: 'public.legal.coppa' },
  { to: '/legal/security', labelKey: 'public.legal.security' },
  { to: '/legal/data-requests', labelKey: 'public.legal.dataRequests' },
  { to: '/legal/accessibility', labelKey: 'public.legal.accessibility' },
  { to: '/legal/cookies', labelKey: 'public.legal.cookies' },
  { to: '/legal/state-addenda', labelKey: 'public.legal.stateAddenda' },
  { to: '/legal/dpa', labelKey: 'public.legal.dpa' },
  { to: '/legal/responsible-disclosure', labelKey: 'public.legal.responsibleDisclosure' },
];

export function LegalSidebar(): JSX.Element {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <select
        value={pathname}
        onChange={(e) => navigate(e.target.value)}
        className="mb-6 flex h-10 w-full rounded-md border bg-background px-3 text-sm md:hidden"
      >
        {LEGAL_PAGES.map((p) => (
          <option key={p.to} value={p.to}>{t(p.labelKey)}</option>
        ))}
      </select>
      <nav className="hidden md:block">
        <ul className="space-y-1 text-sm">
          {LEGAL_PAGES.map((p) => (
            <li key={p.to}>
              <NavLink
                to={p.to}
                className={({ isActive }) =>
                  cn(
                    'block rounded-md px-3 py-1.5',
                    isActive ? 'bg-black/5 font-medium text-foreground' : 'text-muted-foreground hover:bg-black/5',
                  )
                }
              >
                {t(p.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
```

**Step 3: `LegalPageHeader.tsx`** — title, summary, last-updated, version.

```tsx
type Props = {
  title: string;
  summary: string;
  lastUpdated: string;
  version: string;
};
export function LegalPageHeader({ title, summary, lastUpdated, version }: Props): JSX.Element {
  return (
    <div className="border-b pb-6">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{summary}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Last updated: {lastUpdated}</span>
        <span>Version: {version}</span>
      </div>
    </div>
  );
}
```

**Step 4: `LegalLayout.tsx`** — composes the sidebar + draft banner + prose body via React Router's `<Outlet>`.

```tsx
import { Outlet } from 'react-router-dom';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { DraftBanner } from './DraftBanner';
import { LegalSidebar } from './LegalSidebar';

export function LegalLayout(): JSX.Element {
  return (
    <>
      <DraftBanner />
      <SectionBand>
        <Container>
          <div className="grid gap-12 md:grid-cols-[220px_1fr]">
            <aside className="md:sticky md:top-24 md:self-start">
              <LegalSidebar />
            </aside>
            <article className="prose prose-zinc max-w-3xl prose-headings:scroll-mt-28 prose-h2:mt-12 prose-h2:text-2xl prose-h3:text-xl prose-a:text-violet-700">
              <Outlet />
            </article>
          </div>
        </Container>
      </SectionBand>
    </>
  );
}
```

**Step 5: `LegalRoutes.tsx`** — flesh out into the nested-route module. (Tasks 13/14 add the page components.)

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';
import { FerpaPage } from './FerpaPage';
import { SubprocessorsPage } from './SubprocessorsPage';
import { CoppaPage } from './CoppaPage';
import { SecurityPage } from './SecurityPage';
import { DataRequestsPage } from './DataRequestsPage';
import { AccessibilityPage } from './AccessibilityPage';
import { CookiesPage } from './CookiesPage';
import { StateAddendaPage } from './StateAddendaPage';
import { DpaPage } from './DpaPage';
import { ResponsibleDisclosurePage } from './ResponsibleDisclosurePage';

export function LegalRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<LegalLayout />}>
        <Route index element={<Navigate to="/legal/privacy" replace />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="ferpa" element={<FerpaPage />} />
        <Route path="subprocessors" element={<SubprocessorsPage />} />
        <Route path="coppa" element={<CoppaPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="data-requests" element={<DataRequestsPage />} />
        <Route path="accessibility" element={<AccessibilityPage />} />
        <Route path="cookies" element={<CookiesPage />} />
        <Route path="state-addenda" element={<StateAddendaPage />} />
        <Route path="dpa" element={<DpaPage />} />
        <Route path="responsible-disclosure" element={<ResponsibleDisclosurePage />} />
      </Route>
    </Routes>
  );
}
```

**Step 6:** Create one-line stubs for each `apps/web/src/pages/legal/<Name>Page.tsx` so the imports compile. Each stub:

```tsx
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';
export function PrivacyPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader title="Privacy Policy" summary="Coming soon." lastUpdated="2026-05-19" version="v0.1-draft" />
      <p>This page is being filled in.</p>
    </>
  );
}
```

12 stubs, one per page. Tasks 13–14 replace each body with real content.

**Step 7: Verify + commit**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck && pnpm test
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/components/legal/ apps/web/src/pages/legal/
git commit -m "feat(web): legal layout, sidebar, draft banner, and 12 page stubs"
```

---

## Task 13 — Legal content batch 1 (Privacy, Terms, FERPA, Subprocessors, COPPA, Security)

**Files (modify each stub):**
- `apps/web/src/pages/legal/PrivacyPage.tsx`
- `apps/web/src/pages/legal/TermsPage.tsx`
- `apps/web/src/pages/legal/FerpaPage.tsx`
- `apps/web/src/pages/legal/SubprocessorsPage.tsx`
- `apps/web/src/pages/legal/CoppaPage.tsx`
- `apps/web/src/pages/legal/SecurityPage.tsx`

For each page, replace the stub body with starting-template prose using semantic `<h2>` / `<h3>` / `<p>` / `<ul>` (the `prose` plugin handles the styling).

**Authoring rules — apply to all six pages:**
- Open every page with the `LegalPageHeader` (title, one-line summary, `lastUpdated="2026-05-19"`, `version="v0.1-draft"`).
- Use `[INSTITUTION NAME]` / `[COMPANY LEGAL NAME]` / `[STATE]` / `[REGISTERED ADDRESS]` placeholders where counsel must commit specifics.
- 800–1800 words per page (FERPA ~800, COPPA ~600, Privacy ~1500, Terms ~1800, Security ~1200, Subprocessors is a table — short).
- For Subprocessors render an actual `<table>` with columns: Vendor · Service · Region · Purpose · DPA link.
- Each page ends with a small `<p>` block linking to `/legal/data-requests` for questions.

Suggested section headings (one per page):

- **PrivacyPage**: H2 — Who we are · What we collect · Why we collect it · Who we share it with · Retention · Children's data · Your rights · Contact.
- **TermsPage**: H2 — Acceptance · Accounts · Acceptable use · School-as-controller · IP · Fees · Termination · Disclaimers · Governing law · Contact.
- **FerpaPage**: H2 — School-official designation · Categories of records · Use restrictions · Disclosure · Retention and destruction · Audits · Contact.
- **SubprocessorsPage**: H2 — Current subprocessors (table) · Notification of changes · Subprocessor assessment criteria.
- **CoppaPage**: H2 — Operator role · Information collected from children · Behavioral advertising prohibition · Parental consent (delegated) · Deletion · Contact.
- **SecurityPage**: H2 — Encryption · Access control · Audit logging · Backup and recovery · Vulnerability management · Incident response · Compliance status.

Implementation is mechanical once you start — for each file write the prose blocks. Keep tone clear, declarative, no marketing fluff. Treat this as a starting template the user's counsel will edit.

**Step 1:** implement one page at a time. After each, run `pnpm typecheck`.

**Step 2:** When all six are done:

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck && pnpm test
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/pages/legal/PrivacyPage.tsx apps/web/src/pages/legal/TermsPage.tsx apps/web/src/pages/legal/FerpaPage.tsx apps/web/src/pages/legal/SubprocessorsPage.tsx apps/web/src/pages/legal/CoppaPage.tsx apps/web/src/pages/legal/SecurityPage.tsx
git commit -m "feat(web): legal pages batch 1 (Privacy/Terms/FERPA/Subprocessors/COPPA/Security)"
```

---

## Task 14 — Legal content batch 2 (Data Requests + 5 remaining)

**Files (modify each stub):**
- `apps/web/src/pages/legal/DataRequestsPage.tsx`
- `apps/web/src/pages/legal/AccessibilityPage.tsx`
- `apps/web/src/pages/legal/CookiesPage.tsx`
- `apps/web/src/pages/legal/StateAddendaPage.tsx`
- `apps/web/src/pages/legal/DpaPage.tsx`
- `apps/web/src/pages/legal/ResponsibleDisclosurePage.tsx`

**DataRequestsPage** is the most complex — it includes a FERPA-specific intake form. Same submission pipeline as `/contact` for v1 (reuse the same `apiCall('/api/contact', ...)` endpoint with subject = `'data-request'`). The form fields:
- Requester type: `Parent / Eligible student (18+) / Institutional records officer / Other`
- Relationship to institution: free text
- Record category: checkbox group (Education records / AI generation history / Account / Discussion posts / Other)
- Action requested: radio (Inspect / Amend / Delete)
- Description: textarea

Persist the same `contactMessageSchema` for v1 by serializing the structured payload into the `message` field as JSON. Add a `// TODO` note at the call site so a follow-up task replaces with a dedicated endpoint and DB-backed request ticket queue.

The other five pages are pure prose. Use the same authoring rules as batch 1.

Suggested section headings:

- **DataRequestsPage**: H2 — Who can submit · What you can request · How we verify · Response timeline · Submit a request (form).
- **AccessibilityPage**: H2 — Target standard · Current status · Known gaps · Feedback.
- **CookiesPage**: H2 — Essential cookies · Optional analytics · Opt-out · List of cookies (table).
- **StateAddendaPage**: anchored sections (`id="california"`, `id="new-york"`, `id="illinois"`, `id="colorado"`, `id="connecticut"`). Each ~150 words explaining the specific obligations under that state's student-privacy law and how CourseWise's defaults meet them. Add a small in-page nav at the top.
- **DpaPage**: H2 — Plain-language summary · What's in our standard DPA · Customizations we support · Request an executable copy (button → mailto or contact link).
- **ResponsibleDisclosurePage**: H2 — Scope · Reporting · Safe harbor · Response timeline · Hall of fame (placeholder).

**Step 1:** implement six pages.

**Step 2: Commit**

```bash
cd /Users/zhijiangchen/CourseWise/apps/web && pnpm typecheck && pnpm test
cd /Users/zhijiangchen/CourseWise
git add apps/web/src/pages/legal/DataRequestsPage.tsx apps/web/src/pages/legal/AccessibilityPage.tsx apps/web/src/pages/legal/CookiesPage.tsx apps/web/src/pages/legal/StateAddendaPage.tsx apps/web/src/pages/legal/DpaPage.tsx apps/web/src/pages/legal/ResponsibleDisclosurePage.tsx
git commit -m "feat(web): legal pages batch 2 (Data Requests + Accessibility/Cookies/State/DPA/Responsible Disclosure)"
```

---

## Task 15 — Polish pass + manual QA + push & PR

**Files:** none (pure verification + PR).

**Step 1: Full-app typecheck and tests across all three packages.**

```bash
cd /Users/zhijiangchen/CourseWise
pnpm --filter @coursewise/shared typecheck
pnpm --filter @coursewise/api typecheck && pnpm --filter @coursewise/api test
pnpm --filter coursewise-web typecheck && pnpm --filter coursewise-web test
```

All must pass.

**Step 2: Manual browser smoke** (`pnpm dev` at repo root):

- `/` — hero renders, three mock cards stack on mobile, scroll reveals fire smoothly, dark band is dark.
- `/features` — tabs switch, mock card swaps, dark "Built on" rail is legible.
- `/pricing` — both tier cards render; `$X` and `$Y` placeholders are visible (find-and-replace candidate before launch).
- `/about` — three bands render.
- `/contact` — form validates client-side; submit shows the success state; check `wrangler tail` for the log line.
- `/legal/privacy` (and every other legal page) — sidebar highlights the current page; mobile select navigates; draft banner is amber across all twelve.
- `/login`, `/register`, `/teacher/accept-invite` — wrapped in the new shell, look consistent with the rest.
- Language switcher in the footer flips nav + footer chrome between en and zh-CN.
- Resize browser to 360px — nothing horizontally overflows.

If anything is broken, fix it in a small commit and re-run.

**Step 3: Push branch and open PR.**

```bash
git push -u origin public-site-redesign-design
gh pr create --title "Public site redesign + FERPA/legal pages" --body "$(cat <<'EOF'
## Summary

Rebuilds the public surface from a 25-line placeholder into a full bold tech-forward marketing site (Home / Features / Pricing / About / Contact) plus twelve FERPA-oriented legal pages with a shared sticky-rail layout.

### Pages added
- **Marketing (5):** `/`, `/features`, `/pricing`, `/about`, `/contact`
- **Legal (12):** `/legal/privacy`, `/legal/terms`, `/legal/ferpa`, `/legal/subprocessors`, `/legal/coppa`, `/legal/security`, `/legal/data-requests`, `/legal/accessibility`, `/legal/cookies`, `/legal/state-addenda`, `/legal/dpa`, `/legal/responsible-disclosure`
- **Auth (3, restyled):** `/login`, `/register`, `/teacher/accept-invite`

### Visual system
- Bold tech-forward aesthetic: alternating light (`#fafafa`) and dark (`#0a0a0a`) bands.
- Violet→cyan accent ramp used in hero aurora and AI emphasis.
- System UI sans, oversized display type, hairline-bordered components.
- Framer Motion section reveals (honors `prefers-reduced-motion`).
- HTML/CSS mock product cards instead of screenshots — `MockTeacherOverview`, `MockActivityTimeline`, `MockPromptEditor`.

### Trust + compliance
- Every `/legal/*` page wears a draft banner (gated by `LEGAL_DRAFT` flag) reminding admins this is template prose pending counsel review.
- Each page has a `Last updated` + `Version` header.
- Subprocessors page renders an actual table; State Addenda has per-state anchors.
- Data Requests page has a structured intake form; v1 reuses the `/api/contact` stub with structured JSON in the message; follow-up task wires a dedicated table.

### API
- New public `POST /api/contact` route (no auth, validates with `contactMessageSchema` from shared). Logs to the Worker console; real email pipeline is a follow-up.

### What's *not* in this PR (deliberate)
- Real product screenshots — mocks are good enough until UI is visually frozen.
- A blog or changelog — links to GitHub releases instead.
- zh-CN translation of marketing/legal body copy. Nav and footer chrome are bilingual; body copy is English-only with `// TODO(i18n)` markers.
- Pricing dollar amounts — `$X` and `$Y` placeholders with a `TODO_SET_PRICING` comment.

### Test plan
- [x] `pnpm --filter @coursewise/shared typecheck` clean
- [x] `pnpm --filter @coursewise/api typecheck` + `test` clean
- [x] `pnpm --filter coursewise-web typecheck` + `test` clean
- [ ] Manual browser smoke (checklist in PR comments)
- [ ] Lighthouse on `/` and `/features` (target ≥90 for performance + accessibility)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope (intentionally)

- Real institutional logos (placeholder rail only).
- Real product screenshots (mocks are the deliberate choice).
- Custom fonts (system stack is fast and ages well).
- A blog, changelog, or careers page (link to GitHub).
- Server-side rendering / static export — the existing Vite SPA serves these pages.
- A dedicated FERPA data-requests backend (v1 reuses `/api/contact`; follow-up adds a `data_requests` table + admin queue).
- Cookie-consent banner machinery (the Cookies page lists cookies but no consent prompt; we use only essential cookies in v1).
- Real translations of marketing/legal body copy.
- Pricing finalization.
- Lighthouse CI gating.

## Notes for the implementer

- **One commit per task.** Don't squash. The 15 tasks above each correspond to a single commit.
- **No new tests beyond the existing App smoke.** Manual browser smoke is the verification path.
- **Be mechanical about i18n markers.** When you write English-only body copy, add `// TODO(i18n)` so a translator can grep for it. Don't translate body copy yourself.
- **Treat the legal prose as a starting template.** It must be honest, specific, and clearly identify decision points (`[INSTITUTION NAME]`, `[STATE]`). It is **not legal advice** — the draft banner says so prominently.
- **Honor `prefers-reduced-motion`.** Already wired in `Reveal`; don't add other Framer Motion entrances that don't check.
- **Don't import `Layout.tsx`.** It's deleted in Task 4.
