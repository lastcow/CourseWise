# Public site redesign — design

**Date:** 2026-05-19
**Status:** Approved for implementation

## Goal

Replace the placeholder `HomePage` (~25 lines) with a full marketing site —
landing, features, pricing, about, contact — and add the twelve legal /
trust pages an institutional EdTech buyer expects to find before signing a
DPA. The whole public surface, including the existing auth pages, gets a
cohesive, bold-tech-forward look.

## Information architecture

Public site map (17 pages). The signed-in product app is untouched.

```
Marketing                        Legal (sub-section)
─────────────────────            ───────────────────────────
/             Home               /legal/privacy
/features     Features           /legal/terms
/pricing      Pricing            /legal/ferpa
/about        About              /legal/subprocessors
/contact      Contact            /legal/coppa
                                 /legal/security
Auth (existing, restyled)        /legal/data-requests
/login                           /legal/accessibility
/register                        /legal/cookies
/teacher/accept-invite           /legal/state-addenda
                                 /legal/dpa
                                 /legal/responsible-disclosure
```

**Top nav (sticky):**
`Logo  ·  Features  ·  Pricing  ·  About  ·  [Sign in]  [Get started →]`

**Footer (4 columns):** Product · Company · Trust · Legal. Plus org-postal
line, "Built with…" credit, language switcher (en / zh-CN).

**Legal sub-nav:** sticky left rail on `/legal/*`; collapses to a `<select>`
on mobile.

**Two-page contact split.** `/contact` is sales/general; `/legal/data-requests`
is the FERPA-specific intake. Both cross-link each other so a confused user
always lands in the right place.

## Visual system

**Direction:** bold tech-forward. References: Linear, Vercel, Cursor, Notion.

**Palette.** Two surface tiers that alternate band-to-band.

- **Light surface:** bg `#fafafa`, text `#0a0a0a`, muted `#525252`,
  hairline border `#e5e5e5`.
- **Dark surface:** bg `#0a0a0a`, text `#fafafa`, muted `#a3a3a3`,
  hairline border `#1f1f1f`.
- **Accent ramp:** violet → cyan, `#7c3aed → #06b6d4`. Used only in the
  hero aurora, focused-state outlines, and "AI" emphasis runs. No other
  brand color.

**Typography.** System UI sans (no font load — fast).

- Display: `text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]`
- H2: `text-3xl md:text-4xl font-semibold`
- Body: `text-base md:text-lg leading-relaxed`
- Eyebrows: `text-xs uppercase tracking-[0.18em] text-muted-foreground`

**Layout.** 1280px max-width, `px-6 md:px-10`. Vertical rhythm `py-24 md:py-32`.
12-col desktop, 1-col mobile.

**Motifs.**

1. **Aurora hero** — fixed-position blurred radial-gradient mesh behind the
   landing H1, ~20% opacity, slow shifting.
2. **Mock product cards** — HTML/CSS-rendered approximations of the teacher
   overview, activity timeline, prompt editor. Float at slight rotation in
   section corners.
3. **Annotated callouts** — 1px hairline labels pointing into the mocks
   (Cursor/Linear style).

**Motion.** Section reveal via opacity + 4px translate on scroll (Framer
Motion, threshold 20%). No parallax, no autoplay. Honors
`prefers-reduced-motion`.

**Component additions** in `apps/web/src/components/marketing/`:

`Hero`, `AuroraBackground`, `SectionBand` (light/dark), `MockTeacherOverview`,
`MockActivityTimeline`, `MockPromptEditor`, `FeatureRow`, `StatGrid`,
`PricingTier`, `FooterMega`, `LegalSidebar`, `PageHeader`.

## Marketing pages

### `/` Home
Five bands top-to-bottom:

1. **Hero** with aurora. Eyebrow + H1 (~72px) + subhead + dual CTA. Three mock
   product cards floating with slight rotation.
2. **Trust strip** — "Built FERPA-first" pill plus placeholder institutional
   logos.
3. **Value-prop trio** (light surface): *AI you control*, *Every role, one
   tool*, *FERPA-first by design*.
4. **Product showcase** (dark surface) — three alternating left/right mock
   blocks with annotated callouts.
5. **CTA band** then footer.

### `/features`
Role tabs (Teachers / Students / Admins). Each tab is a 2-col grid: copy +
checklist + mock product card. Bottom: **"Built on"** rail (Cloudflare Workers,
Anthropic, Neon, R2) for transparency.

### `/pricing`
Two-tier card layout.

- **Educators · $X / teacher / month** (placeholder, `// TODO set numbers`).
- **Institutions · $Y / student / year, billed annually** (placeholder).

Below: 6-question FAQ. Right-side callout: *"Need a DPA, BAA, or state
addendum? See [Trust](/legal/security)."*

### `/about`
Three short bands: **Mission** (~80 words), **What we believe** (3 stances —
Transparency, FERPA-first, AI you control), **Team** ("We're a small team
building in the open" — links to GitHub / changelog).

### `/contact`
Split intake header: *Sales · Press · Customer support · Data requests →
/legal/data-requests*. Single form (name, email, institution, subject
dropdown, message). Stub `POST /api/contact` endpoint that logs +
emails (real wiring is a later task). Response-time SLA copy below.

## Legal pages

**Shared shell `LegalLayout`:**

- Two-column desktop, single-column mobile.
- Sticky left sub-nav listing all 12 legal pages.
- Page header: title, summary, `Last updated`, `Version`, "Download PDF"
  placeholder button.
- Body column: prose-styled, max-width `max-w-3xl`. Auto ToC on pages with
  ≥3 H2s.
- Page footer: effective date, last reviewed, contact link to
  `/legal/data-requests`.

**Draft banner:**
> **Template — not legal advice.** Edit before publishing. Have legal counsel
> review.

Rendered conditionally via a `LEGAL_DRAFT` flag in code; flip off site-wide
when counsel signs off.

**Per-page scope:**

| Page | Coverage |
|---|---|
| `/legal/privacy` | Data categories, purpose, processors, retention, rights, contact. ~1500 words. |
| `/legal/terms` | Acceptable use, IP, school-controller / vendor-school-official language, SLA disclaimer, governing law. ~1800 words. |
| `/legal/ferpa` | School-official assertion under §99.31(a)(1)(i)(B), records categories, no secondary use, audit availability. ~800 words. |
| `/legal/subprocessors` | Live table: Cloudflare (Workers, R2, AI Gateway), Neon (Postgres), Anthropic (Claude) — region + purpose + DPA link. |
| `/legal/coppa` | Operator status, no behavioral ads, parental consent delegated to school, deletion path. ~600 words. |
| `/legal/security` | Encryption, access controls, incident response, deletion, pen-test cadence, SOC-2 status. |
| `/legal/data-requests` | FERPA intake form: requester type, record category, action, institution context. |
| `/legal/accessibility` | WCAG 2.1 AA target, known gaps, remediation contact. |
| `/legal/cookies` | Essential vs analytics, opt-out, list of cookies. |
| `/legal/state-addenda` | Anchors: California (SOPIPA), New York (Ed Law §2-d), Illinois (SOPPA), Colorado, Connecticut. |
| `/legal/dpa` | Plain-language summary + "Request executable copy" button. |
| `/legal/responsible-disclosure` | Reporting address, safe-harbor language, response-time, scope. |

Body content is starting-template prose with `[INSTITUTION NAME]` /
`[DATE]` placeholders where counsel must commit.

## Out of scope

- A blog or changelog page (link to GitHub releases instead).
- Real product screenshots (mock UI cards are good enough until product is
  visually frozen).
- Custom fonts (system stack is intentional for speed).
- Pricing page A/B test infrastructure.
- An actual `POST /api/contact` mailer — the endpoint stub logs only;
  follow-up task wires Postmark or similar.
