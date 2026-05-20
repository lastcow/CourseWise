import { useTranslation } from 'react-i18next';
import { BookOpen, ClipboardList, FileText, MessagesSquare, Presentation } from 'lucide-react';

export interface ModuleContentCounts {
  materials: number;
  presentations: number;
  assignments: number;
  quizzes: number;
  discussions: number;
}

export function ModuleContentSummary({ counts }: { counts: ModuleContentCounts }): JSX.Element {
  const { t } = useTranslation();
  const entries: Array<{ key: keyof ModuleContentCounts; icon: typeof BookOpen; label: string }> = [
    { key: 'materials', icon: BookOpen, label: t('modules.summary.materials', { count: counts.materials }) },
    { key: 'presentations', icon: Presentation, label: t('modules.summary.presentations', { count: counts.presentations }) },
    { key: 'assignments', icon: ClipboardList, label: t('modules.summary.assignments', { count: counts.assignments }) },
    { key: 'quizzes', icon: FileText, label: t('modules.summary.quizzes', { count: counts.quizzes }) },
    { key: 'discussions', icon: MessagesSquare, label: t('modules.summary.discussions', { count: counts.discussions }) },
  ];
  const visible = entries.filter((e) => counts[e.key] > 0);
  if (visible.length === 0) {
    return (
      <span className="text-xs italic text-muted-foreground">{t('modules.summary.empty')}</span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {visible.map(({ key, icon: Icon, label }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5"
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}
