import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { SUPPORTED_LOCALES, type Locale } from '@coursewise/shared';
import { cn } from '@/lib/utils';

const LOCALE_LABELS: Record<Locale, { short: string; full: string }> = {
  en: { short: 'EN', full: 'English' },
  'zh-CN': { short: '中', full: '简体中文' },
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

export function LanguageSwitcher({ className }: LanguageSwitcherProps): JSX.Element {
  const { i18n, t } = useTranslation();
  const current = resolveLocale(i18n.resolvedLanguage ?? i18n.language);
  const currentIndex = SUPPORTED_LOCALES.indexOf(current);
  const next =
    SUPPORTED_LOCALES[(currentIndex + 1) % SUPPORTED_LOCALES.length] ?? SUPPORTED_LOCALES[0];
  const nextLabel = LOCALE_LABELS[next].full;
  const currentLabel = LOCALE_LABELS[current];

  const onClick = (): void => {
    void i18n.changeLanguage(next);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('nav.switchLanguage', { language: nextLabel })}
      title={t('nav.switchLanguage', { language: nextLabel })}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Languages className="h-4 w-4" aria-hidden />
      <span className="text-xs font-medium tabular-nums">{currentLabel.short}</span>
    </button>
  );
}
