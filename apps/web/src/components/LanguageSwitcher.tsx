import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { SUPPORTED_LOCALES, type Locale } from '@coursewise/shared';
import { cn } from '@/lib/utils';

const LOCALE_LABELS: Record<Locale, { short: string; full: string }> = {
  en: { short: 'EN', full: 'English' },
  'zh-CN': { short: '中', full: '简体中文' },
  fr: { short: 'FR', full: 'Français' },
};

function resolveLocale(lng: string | undefined): Locale {
  if (!lng) return 'en';
  const exact = SUPPORTED_LOCALES.find((l) => l === lng);
  if (exact) return exact;
  const base = lng.split('-')[0];
  const match = SUPPORTED_LOCALES.find((l) => l === base || l.startsWith(`${base}-`));
  return match ?? 'en';
}

type LanguageSwitcherProps = {
  className?: string;
};

/**
 * Click-to-open language menu. The trigger shows the current locale's
 * short tag; the popover lists every SUPPORTED_LOCALES entry with its
 * full label, and a check mark next to the active one. Outside-click
 * and Esc both dismiss.
 */
export function LanguageSwitcher({ className }: LanguageSwitcherProps): JSX.Element {
  const { i18n, t } = useTranslation();
  const current = resolveLocale(i18n.resolvedLanguage ?? i18n.language);
  const currentLabel = LOCALE_LABELS[current];
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Outside click + Escape close the menu. Mount-once listeners; the
  // refs guard against the click that opened the menu being treated as
  // an outside-click on the same render.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onPick = (next: Locale): void => {
    setOpen(false);
    if (next === current) return;
    void i18n.changeLanguage(next);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.changeLanguage', { language: currentLabel.full })}
        title={t('nav.changeLanguage', { language: currentLabel.full })}
        className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Languages className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium tabular-nums">{currentLabel.short}</span>
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="menu"
          // bg-card (not bg-popover) — the project's Tailwind config
          // doesn't register a `popover` color token, so bg-popover
          // resolves to transparent. shadow-lg gives the menu enough
          // depth to read against the topbar's blurred backdrop.
          className="absolute right-0 top-full z-40 mt-1 min-w-[10rem] overflow-hidden rounded-md border bg-card text-card-foreground shadow-lg"
        >
          <ul className="py-1">
            {SUPPORTED_LOCALES.map((loc) => {
              const active = loc === current;
              const label = LOCALE_LABELS[loc];
              return (
                <li key={loc}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => onPick(loc)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                      'hover:bg-accent hover:text-foreground focus:bg-accent focus:outline-none',
                      active ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <span className="w-4 shrink-0">
                      {active ? (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      ) : null}
                    </span>
                    <span className="flex-1 truncate">{label.full}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {label.short}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
