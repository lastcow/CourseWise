import { useTranslation } from 'react-i18next';

/**
 * Real-time capacity preview for the create / edit group-set dialogs:
 * `groups × maxPerGroup`. Renders a muted strip so teachers see how many
 * students the new shape can actually hold while they tweak inputs.
 * Hidden until both values parse to positive integers, so the dialog
 * stays clean before the teacher has typed anything sensible.
 */
export function CapacityHint({
  groups,
  maxPer,
}: {
  groups: string;
  maxPer: string;
}): JSX.Element | null {
  const { t } = useTranslation();
  const n = Number.parseInt(groups, 10);
  const m = Number.parseInt(maxPer, 10);
  if (!Number.isFinite(n) || !Number.isFinite(m) || n <= 0 || m <= 0) return null;
  return (
    <p
      className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      aria-live="polite"
    >
      {t('groups.capacityHint', { groups: n, max: m, total: n * m })}
    </p>
  );
}
