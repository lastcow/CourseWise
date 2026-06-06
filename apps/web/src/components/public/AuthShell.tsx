import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandMark } from './BrandMark';

const PERSPECTIVES = [
  { k: 'Teachers', v: 'Build modules, draft materials with AI, grade and track attendance.' },
  { k: 'Students', v: 'One calm home for coursework, submissions, and grades.' },
  { k: 'Admins', v: 'Govern AI prompts and student data across every course.' },
];

/** The branded editorial panel shown beside auth forms on large screens. */
function AuthBrandPanel(): JSX.Element {
  return (
    <aside className="grain grain-dark relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {/* ambient warm bloom */}
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-[36rem] w-[36rem] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(47,93,80,0.45), rgba(47,93,80,0) 70%)' }}
        aria-hidden
      />
      <Link to="/" className="relative flex items-center gap-2.5">
        <BrandMark className="h-7 w-7" />
        <span className="font-display text-lg font-semibold tracking-tight">CourseWise</span>
      </Link>

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen-200">
          for serious teaching
        </p>
        <h2 className="mt-4 max-w-md font-display text-4xl font-semibold leading-[1.08] tracking-[-0.02em] text-balance xl:text-[2.9rem]">
          Course operations and AI authoring, under one roof.
        </h2>
        <ul className="mt-10 space-y-5">
          {PERSPECTIVES.map((p) => (
            <li key={p.k} className="flex gap-4">
              <span className="mt-2 h-px w-8 shrink-0 bg-evergreen-200/70" aria-hidden />
              <div>
                <div className="text-sm font-semibold">{p.k}</div>
                <div className="mt-0.5 max-w-sm text-sm text-paper/70">{p.v}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-paper/70">
        FERPA-first · one data model · you control the AI
      </p>
    </aside>
  );
}

/** Eyebrow + title + subtitle for the form column. */
export function AuthHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}): JSX.Element {
  return (
    <div className="mb-8">
      {eyebrow ? (
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen">
          {eyebrow}
        </div>
      ) : null}
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.01em]">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-ink-400">{subtitle}</p> : null}
    </div>
  );
}

/** Split-screen auth layout: editorial brand panel + form column.
 *  Rendered inside PublicLayout (header above, footer below). */
export function AuthShell({ children }: { children: React.ReactNode }): JSX.Element {
  // Surfaces the brand mark on small screens where the side panel is hidden.
  const { t } = useTranslation();
  return (
    <div className="relative grid min-h-[calc(100dvh-4rem)] lg:grid-cols-2">
      <AuthBrandPanel />
      <div className="flex flex-col justify-center px-6 py-14 sm:px-10">
        <Link to="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
          <BrandMark className="h-7 w-7" />
          <span className="font-display text-lg font-semibold tracking-tight">{t('app.name')}</span>
        </Link>
        <div className="mx-auto w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
