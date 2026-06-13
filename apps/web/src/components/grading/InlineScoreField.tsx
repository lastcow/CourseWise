import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { pickI18nKey } from '@/lib/api';

// Hide the number spinner — the score reads as "x / max" and the arrows add noise.
const SCORE_INPUT_CLASS =
  'h-8 w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden';

const fmtScore = (n: number | null): string => (n !== null ? String(n) : '');

/**
 * A numeric grade field that auto-saves when it loses focus (blur) or on Enter,
 * with an inline saving/saved indicator. Esc reverts. Empty never clears an
 * existing grade; out-of-range values are rejected with a toast. Shared by the
 * gradebook subsection and the assignment submissions subsection.
 */
export function InlineScoreField({
  initial,
  maxScore,
  placeholder,
  onCommit,
}: {
  initial: number | null;
  maxScore: number;
  placeholder?: string;
  onCommit: (score: number) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [value, setValue] = useState<string>(fmtScore(initial));
  const valueRef = useRef(value);
  const focusedRef = useRef(false);
  const skipRef = useRef(false);
  const mountedRef = useRef(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => () => void (mountedRef.current = false), []);

  // Reconcile with the canonical value after a refetch, unless mid-edit.
  useEffect(() => {
    if (!focusedRef.current) {
      const next = fmtScore(initial);
      valueRef.current = next;
      setValue(next);
    }
  }, [initial]);

  const set = (v: string): void => {
    valueRef.current = v;
    setValue(v);
  };

  const commit = async (): Promise<void> => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const current = fmtScore(initial);
    const trimmed = valueRef.current.trim();
    if (trimmed === current) return; // unchanged
    if (trimmed === '') {
      set(current); // empty doesn't clear an existing grade
      return;
    }
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0 || n > maxScore) {
      toast.push({ title: t('grading.detailScoreInvalid'), tone: 'error' });
      set(current);
      return;
    }
    setSaving(true);
    try {
      await onCommit(n);
      if (mountedRef.current) setSaved(true);
    } catch (err) {
      if (mountedRef.current) set(current);
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min={0}
        max={maxScore}
        step={0.5}
        className={SCORE_INPUT_CLASS}
        value={value}
        placeholder={placeholder}
        aria-label={t('grading.score')}
        onChange={(e) => set(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
          setSaved(false);
        }}
        onBlur={() => {
          focusedRef.current = false;
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            skipRef.current = true;
            set(fmtScore(initial));
            e.currentTarget.blur();
          }
        }}
      />
      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
        / {maxScore}
      </span>
      <span className="flex w-4 justify-center" aria-hidden>
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : saved ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : null}
      </span>
    </div>
  );
}
