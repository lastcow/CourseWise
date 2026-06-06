import { useTranslation } from 'react-i18next';
import { BookOpen, ClipboardList, FileText, MessagesSquare, Presentation } from 'lucide-react';

export interface ModuleContentCounts {
  materials: number;
  presentations: number;
  assignments: number;
  quizzes: number;
  discussions: number;
}

/**
 * Per-module content tally surfaced in the accordion header.
 * Each entry is a compact flat outlined chip (border + bg-background) holding
 * just the type icon and a tiny outlined badge with the numeric count. The
 * type label is hidden to keep the strip compact and revealed on hover via the
 * native `title` tooltip (and exposed to assistive tech via `aria-label`).
 */
export function ModuleContentSummary({ counts }: { counts: ModuleContentCounts }): JSX.Element {
  const { t } = useTranslation();
  // Order is deliberate: assignments first, then reading materials, then
  // the rest. Surfaces what's most often actionable on the left of the chip
  // group (closest to the title).
  const entries: Array<{
    key: keyof ModuleContentCounts;
    icon: typeof BookOpen;
    label: string;
  }> = [
    { key: 'assignments', icon: ClipboardList, label: t('modules.summary.assignmentsLabel') },
    { key: 'materials', icon: BookOpen, label: t('modules.summary.materialsLabel') },
    { key: 'presentations', icon: Presentation, label: t('modules.summary.presentationsLabel') },
    { key: 'quizzes', icon: FileText, label: t('modules.summary.quizzesLabel') },
    { key: 'discussions', icon: MessagesSquare, label: t('modules.summary.discussionsLabel') },
  ];
  const visible = entries.filter((e) => counts[e.key] > 0);
  if (visible.length === 0) {
    return (
      <span className="text-xs italic text-muted-foreground">{t('modules.summary.empty')}</span>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {visible.map(({ key, icon: Icon, label }) => (
        <span
          key={key}
          // Hover reveals the type name; aria-label keeps it accessible since
          // the visible text label is dropped to keep the strip compact.
          title={label}
          aria-label={`${label}: ${counts[key]}`}
          // h-8 matches ActionIconButton's default size so the chip strip
          // and the trailing action icons sit on the same baseline.
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground"
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-sm border border-input px-1 text-[10px] font-medium leading-none tabular-nums text-foreground">
            {counts[key]}
          </span>
        </span>
      ))}
    </div>
  );
}
