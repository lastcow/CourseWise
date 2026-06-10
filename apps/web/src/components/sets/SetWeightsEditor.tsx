import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

// Match the gradebook's spinner-free number inputs.
const WEIGHT_INPUT_CLASS =
  'w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden';

/**
 * Per-member weight editor for the 'weighted' set scoring rule. One row per
 * member: title · weight input · live share chip (weight / Σweights). Weights
 * are relative — the share column is what actually matters, and it updates as
 * the teacher types. Controlled: parent owns the weights record.
 */
export function SetWeightsEditor({
  members,
  weights,
  onChange,
}: {
  members: Array<{ id: string; title: string }>;
  weights: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const weightOf = (id: string): number => {
    const w = weights[id];
    return typeof w === 'number' && w > 0 ? w : 1;
  };
  const total = members.reduce((acc, m) => acc + weightOf(m.id), 0);

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('assignments.setWeightsTitle')}
        </span>
        <span className="text-xs text-muted-foreground">{t('assignments.setWeightLabel')}</span>
      </div>
      <ul className="space-y-1.5">
        {members.map((m) => {
          const share = total > 0 ? (weightOf(m.id) / total) * 100 : 0;
          return (
            <li key={m.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-sky-900 dark:bg-sky-950 dark:text-sky-300">
                {t('assignments.setWeightShare', { pct: Math.round(share) })}
              </span>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                aria-label={`${t('assignments.setWeightLabel')}: ${m.title}`}
                className={WEIGHT_INPUT_CLASS}
                value={weights[m.id] ?? 1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange({ ...weights, [m.id]: Number.isFinite(v) && v > 0 ? v : 1 });
                }}
              />
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t('assignments.setWeightsHint')}</p>
    </div>
  );
}
