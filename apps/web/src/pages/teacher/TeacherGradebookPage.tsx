import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Search } from 'lucide-react';
import type { FinalGradeSummary } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  downloadGradesCsv,
  useFinalGrades,
  useRecalculateFinalGrades,
  useZeroMissingScores,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}): JSX.Element {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-2xl font-semibold tabular-nums',
          tone === 'warning' ? 'text-amber-600' : 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function TeacherGradebookPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const grades = useFinalGrades(cid || null);
  const recalculate = useRecalculateFinalGrades(cid);
  const zeroMissing = useZeroMissingScores(cid);
  const toast = useToast();
  const confirm = useConfirm();

  // Toolbar: free-text search (name / student number / email) + letter chips.
  const [search, setSearch] = useState('');
  const [letterFilter, setLetterFilter] = useState<Set<string>>(new Set());

  async function onZeroMissing(): Promise<void> {
    const ok = await confirm({
      title: t('grading.zeroMissingTitle'),
      description: t('grading.zeroMissingBody'),
      detail: { name: t('grading.zeroMissingScope') },
      confirmLabel: t('grading.zeroMissingConfirm'),
    });
    if (!ok) return;
    try {
      const n = await zeroMissing.mutateAsync();
      toast.push({ title: t('grading.zeroMissingDone', { count: n }), tone: 'success' });
      if (n > 0) {
        // Zeroed scores change the rollups — recompute right away so the
        // table doesn't sit in the "outdated" state.
        const res = await recalculate.mutateAsync();
        toast.push({ title: t('grading.recalcDone', { count: res.updated }), tone: 'success' });
      }
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onRecalc() {
    try {
      const res = await recalculate.mutateAsync();
      toast.push({
        title: t('grading.recalcDone', { count: res.updated }),
        tone: 'success',
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  const rows = useMemo(() => grades.data ?? [], [grades.data]);

  const LETTERS = ['A', 'B', 'C', 'D', 'F'] as const;
  // "B+" / "b-" bucket under B; effective letter is the grade's first char.
  const letterOf = (g: FinalGradeSummary): string | null =>
    g.letterGrade ? g.letterGrade[0]!.toUpperCase() : null;

  const letterCounts = useMemo(() => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const g of rows) {
      const l = letterOf(g);
      if (l && l in counts) counts[l] = (counts[l] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((g) => {
      if (q) {
        const hit =
          (g.studentName ?? '').toLowerCase().includes(q) ||
          (g.studentNumber ?? '').toLowerCase().includes(q) ||
          (g.studentEmail ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (letterFilter.size > 0) {
        const l = letterOf(g);
        if (!l || !letterFilter.has(l)) return false;
      }
      return true;
    });
  }, [rows, search, letterFilter]);

  const filtering = search.trim() !== '' || letterFilter.size > 0;

  function toggleLetter(l: string): void {
    setLetterFilter((cur) => {
      const next = new Set(cur);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  }

  const stats = useMemo(() => {
    const scored = rows.map((g) => g.score).filter((s): s is number => s !== null);
    const average = scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    const outdated = rows.filter((g) => g.isOutdated).length;
    return { enrolled: rows.length, graded: scored.length, average, outdated };
  }, [rows]);

  return (
    <div className="space-y-4">
      <CourseSectionHeader
        title={t('grading.gradebookTitle')}
        count={grades.data?.length}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => downloadGradesCsv(cid)}>
              {t('grading.exportCsv')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onZeroMissing()}
              disabled={zeroMissing.isPending || recalculate.isPending}
            >
              {t('grading.zeroMissingCta')}
            </Button>
            <Button size="sm" onClick={onRecalc} disabled={recalculate.isPending}>
              {t('grading.recalculate')}
            </Button>
          </>
        }
      />
      {grades.isLoading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title={t('grading.gradebookEmpty')}
          description={t('grading.gradebookEmptyHint')}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={t('grading.summaryEnrolled')} value={String(stats.enrolled)} />
            <StatTile
              label={t('grading.summaryGraded')}
              value={`${stats.graded}/${stats.enrolled}`}
            />
            <StatTile
              label={t('grading.summaryAverage')}
              value={stats.average !== null ? stats.average.toFixed(1) : '—'}
            />
            <StatTile
              label={t('grading.summaryOutdated')}
              value={String(stats.outdated)}
              tone={stats.outdated > 0 ? 'warning' : 'default'}
            />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            {/* Toolbar attached to the student table: search left, letter chips right. */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('grading.searchStudents')}
                    aria-label={t('grading.searchStudents')}
                    className="h-9 w-72 max-w-full bg-background pl-8"
                  />
                </div>
                {filtering ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t('grading.filterShowing', {
                      shown: filteredRows.length,
                      total: rows.length,
                    })}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {LETTERS.map((l) => {
                  const active = letterFilter.has(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleLetter(l)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <span>{l}</span>
                      <span className="tabular-nums opacity-70">{letterCounts[l] ?? 0}</span>
                    </button>
                  );
                })}
                {filtering ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setLetterFilter(new Set());
                    }}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
                  >
                    {t('grading.filterClear')}
                  </button>
                ) : null}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t('grading.student')}</th>
                  <th className="px-3 py-2 font-medium">{t('grading.score')}</th>
                  <th className="px-3 py-2 font-medium">{t('grading.letter')}</th>
                  <th className="px-3 py-2 font-medium">{t('grading.overrides')}</th>
                  <th className="px-3 py-2 font-medium">{t('grading.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      {t('grading.filterNoMatch')}
                    </td>
                  </tr>
                ) : null}
                {filteredRows.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        to={`/teacher/courses/${cid}/gradebook/${g.studentId}`}
                        className="font-medium hover:underline"
                      >
                        {g.studentName ?? '—'}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {g.studentEmail}
                        {g.studentNumber ? (
                          <span className="tabular-nums"> · #{g.studentNumber}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {g.score?.toFixed(1) ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono">{g.letterGrade ?? '—'}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {(g.overrideCount ?? 0) > 0 ? g.overrideCount : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {g.isOutdated ? (
                        <Badge variant="secondary">{t('grading.outdated')}</Badge>
                      ) : (
                        <Badge variant="success">{t('grading.current')}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
