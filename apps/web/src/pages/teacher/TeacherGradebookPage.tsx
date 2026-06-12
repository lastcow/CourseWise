import { Fragment, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, GraduationCap, Search, Users } from 'lucide-react';
import type { FinalGradeSummary } from '@coursewise/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { PreparingGradesDialog } from '@/components/gradebook/PreparingGradesDialog';
import { StudentGradesSubsection } from '@/components/gradebook/StudentGradesSubsection';
import { downloadGradesCsv, useFinalGrades, useZeroMissingScores } from '@/lib/queries';
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
  const zeroMissing = useZeroMissingScores(cid);
  const toast = useToast();
  const confirm = useConfirm();

  // Toolbar: free-text search (name / student number / email) + letter chips.
  const [search, setSearch] = useState('');
  const [letterFilter, setLetterFilter] = useState<Set<string>>(new Set());
  // Per-student expand-to-edit subsection (keyed by studentId).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(studentId: string): void {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

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
      // No recompute needed — final grades recalculate on the next read.
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
    return { enrolled: rows.length, graded: scored.length, average };
  }, [rows]);

  return (
    <div className="space-y-4">
      <PreparingGradesDialog open={grades.isLoading} />
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
              disabled={zeroMissing.isPending}
            >
              {t('grading.zeroMissingCta')}
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
          <div className="grid grid-cols-3 gap-3">
            <StatTile label={t('grading.summaryEnrolled')} value={String(stats.enrolled)} />
            <StatTile
              label={t('grading.summaryGraded')}
              value={`${stats.graded}/${stats.enrolled}`}
            />
            <StatTile
              label={t('grading.summaryAverage')}
              value={stats.average !== null ? stats.average.toFixed(1) : '—'}
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
                  <th className="w-8 px-1 py-2" aria-hidden />
                  <th className="px-3 py-2 font-medium">{t('grading.student')}</th>
                  <th className="px-3 py-2 font-medium">{t('grading.score')}</th>
                  <th className="px-3 py-2" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      {t('grading.filterNoMatch')}
                    </td>
                  </tr>
                ) : null}
                {filteredRows.map((g) => {
                  const isOpen = expanded.has(g.studentId);
                  return (
                    <Fragment key={g.id}>
                  <tr className="border-b last:border-0 hover:bg-muted/30">
                    <td className="w-8 px-1 align-top">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(g.studentId)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? t('grading.collapseGrades') : t('grading.expandGrades')}
                        className="mt-1.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronRight
                          className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')}
                          aria-hidden
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          to={`/teacher/courses/${cid}/gradebook/${g.studentId}`}
                          className="font-medium hover:underline"
                        >
                          {g.studentName ?? '—'}
                        </Link>
                        {g.groupNames?.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                          >
                            <Users className="h-3 w-3" aria-hidden />
                            {name}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {g.studentEmail}
                        {g.studentNumber ? (
                          <span className="tabular-nums"> · #{g.studentNumber}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums align-top">
                      {g.score?.toFixed(1) ?? '—'}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {(g.ungradedCount ?? 0) > 0 ? (
                        <span
                          title={t('grading.ungradedHint', { count: g.ungradedCount })}
                          className="inline-flex items-center border border-amber-500/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-600 dark:border-amber-400/70 dark:text-amber-400"
                        >
                          {g.ungradedCount}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-b bg-muted/20 last:border-0">
                      <td aria-hidden />
                      <td colSpan={3} className="py-3 pr-4">
                        <StudentGradesSubsection courseId={cid} studentId={g.studentId} />
                      </td>
                    </tr>
                  ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
