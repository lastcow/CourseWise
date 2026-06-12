import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  BookOpen,
  ClipboardList,
  Layers,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import type {
  GradebookAssignmentItem,
  GradebookAttendanceItem,
  GradebookDiscussionItem,
  GradebookQuizItem,
  GradebookStudentDetail,
  GroupScoreBreakdown,
} from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useMyGradebookDetail } from '@/lib/queries';

// ---------------------------------------------------------------------------
// Normalized row shape. Every gradable item (assignment / quiz / discussion)
// is flattened to this so a single, consistent row renderer can present the
// student's own score, the maximum, a percentage, and a plain-language status.
// ---------------------------------------------------------------------------

type RowTone = 'success' | 'warning' | 'muted';

interface NormalizedRow {
  key: string;
  type: 'assignment' | 'quiz' | 'discussion' | 'set';
  title: string;
  score: number | null;
  max: number | null;
  statusLabel: string;
  statusTone: RowTone;
  feedback: string | null;
  // Member rows of a set: indented and shown as not-counted context.
  indent?: boolean;
}

const TYPE_ICON: Record<NormalizedRow['type'], LucideIcon> = {
  assignment: ClipboardList,
  quiz: BookOpen,
  discussion: MessageSquare,
  set: Layers,
};

function fmt(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined ? '—' : n.toFixed(digits);
}

function percent(score: number | null, max: number | null): number | null {
  if (score === null || max === null || max <= 0) return null;
  return (score / max) * 100;
}

function toneClass(tone: RowTone): string {
  switch (tone) {
    case 'success':
      return 'text-emerald-700';
    case 'warning':
      return 'text-amber-700';
    default:
      return 'text-muted-foreground';
  }
}

export function StudentGradePage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? null;
  const detail = useMyGradebookDetail(cid);

  // Translators for each item type → the shared NormalizedRow.
  const normalizers = useMemo(() => {
    const assignment = (a: GradebookAssignmentItem): NormalizedRow => {
      const graded = a.score !== null;
      const submitted = a.submissionId !== null;
      return {
        key: `a-${a.assignmentId}`,
        type: 'assignment',
        title: a.title,
        score: a.zeroedAsMissing ? 0 : a.score,
        max: a.maxScore,
        statusLabel: graded
          ? t('grading.graded')
          : a.zeroedAsMissing
            ? t('grading.pastDueZero')
            : submitted
              ? t('grading.awaitingGrade')
              : t('grading.notSubmitted'),
        statusTone: graded ? 'success' : a.zeroedAsMissing || submitted ? 'warning' : 'muted',
        feedback: a.feedback,
      };
    };
    const quiz = (q: GradebookQuizItem): NormalizedRow => {
      const graded = q.score !== null;
      const attempted = q.attemptId !== null;
      return {
        key: `q-${q.quizId}`,
        type: 'quiz',
        title: q.title,
        score: q.zeroedAsMissing ? 0 : q.score,
        max: q.maxScore,
        statusLabel: graded
          ? t('grading.graded')
          : q.zeroedAsMissing
            ? t('grading.pastDueZero')
            : attempted
              ? t('grading.awaitingGrade')
              : t('grading.noAttempt'),
        statusTone: graded ? 'success' : q.zeroedAsMissing || attempted ? 'warning' : 'muted',
        feedback: null,
      };
    };
    const discussion = (d: GradebookDiscussionItem): NormalizedRow => {
      const graded = d.score !== null;
      return {
        key: `d-${d.topicId}`,
        type: 'discussion',
        title: d.title,
        score: d.zeroedAsMissing ? 0 : d.score,
        max: d.maxScore,
        statusLabel: graded
          ? t('grading.graded')
          : d.zeroedAsMissing
            ? t('grading.pastDueZero')
            : t('grading.awaitingGrade'),
        statusTone: graded ? 'success' : 'warning',
        feedback: d.feedback,
      };
    };
    return { assignment, quiz, discussion };
  }, [t]);

  const view = useMemo(() => {
    if (!detail.data) return null;
    return buildView(detail.data, normalizers, t);
  }, [detail.data, normalizers, t]);

  if (detail.isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>;
  }
  if (!detail.data || !view) {
    return (
      <EmptyState title={t('grading.noItemsYet')} description={t('grading.noItemsYetHint')} />
    );
  }

  const d = detail.data;
  const hasAnyItem =
    view.categories.some((c) => c.rows.length > 0) ||
    view.attendance !== null ||
    view.otherRows.length > 0;

  return (
    <div className="space-y-5">
      <GradeHero detail={d} />

      {!hasAnyItem ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              title={t('grading.noItemsYet')}
              description={t('grading.noItemsYetHint')}
            />
          </CardContent>
        </Card>
      ) : null}

      {view.categories.map((cat) => (
        <CategoryCard key={cat.groupId} category={cat} />
      ))}

      {view.attendance ? <AttendanceCard attendance={view.attendance} /> : null}

      {view.otherRows.length > 0 ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t('grading.otherItemsTitle')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('grading.otherItemsHint')}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <ItemTable rows={view.otherRows} />
          </CardContent>
        </Card>
      ) : null}

      <PolicyCard detail={d} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// View model: pool the flat item lists into lookup maps, then lay them out by
// weighted category (mirroring how the final grade is computed) plus an
// "other items" bucket for anything not assigned to a category.
// ---------------------------------------------------------------------------

interface CategoryView {
  groupId: string;
  name: string;
  weight: number;
  raw: number | null;
  weighted: number;
  itemsScored: number;
  itemCount: number;
  rows: NormalizedRow[];
}

interface AttendanceView {
  rate: number | null;
  weight: number;
  weighted: number;
  items: GradebookAttendanceItem[];
}

interface GradeView {
  categories: CategoryView[];
  attendance: AttendanceView | null;
  otherRows: NormalizedRow[];
}

function buildView(
  d: GradebookStudentDetail,
  norm: {
    assignment: (a: GradebookAssignmentItem) => NormalizedRow;
    quiz: (q: GradebookQuizItem) => NormalizedRow;
    discussion: (d: GradebookDiscussionItem) => NormalizedRow;
  },
  t: TFunction,
): GradeView {
  const assignments = new Map(d.assignments.items.map((a) => [a.assignmentId, a]));
  const quizzes = new Map(d.quizzes.items.map((q) => [q.quizId, q]));
  const discussions = new Map(d.discussion.items.map((x) => [x.topicId, x]));

  const seen = new Set<string>();
  const rowFor = (itemId: string, itemType: NormalizedRow['type']): NormalizedRow | null => {
    if (itemType === 'assignment') {
      const a = assignments.get(itemId);
      return a ? norm.assignment(a) : null;
    }
    if (itemType === 'quiz') {
      const q = quizzes.get(itemId);
      return q ? norm.quiz(q) : null;
    }
    const x = discussions.get(itemId);
    return x ? norm.discussion(x) : null;
  };

  const groups: GroupScoreBreakdown[] = d.finalGrade?.groups ?? [];
  const categories: CategoryView[] = groups.map((g) => {
    const rows: NormalizedRow[] = [];
    for (const item of g.detail) {
      seen.add(item.itemId);
      if (item.itemType === 'set') {
        // The set's rolled-up row (this is what counts), followed by its member
        // assignments as indented, not-counted context.
        rows.push({
          key: `set-${item.itemId}`,
          type: 'set',
          title: item.title,
          score: item.score,
          max: item.max,
          statusLabel: item.score !== null ? t('grading.graded') : t('grading.awaitingGrade'),
          statusTone: item.score !== null ? 'success' : 'muted',
          feedback: null,
        });
        for (const m of item.members ?? []) {
          seen.add(m.itemId);
          rows.push({
            key: `setmember-${m.itemId}`,
            type: 'assignment',
            title: m.title,
            score: m.score,
            max: m.max,
            statusLabel: m.zeroedAsMissing
              ? t('grading.pastDueZero')
              : m.score !== null
                ? t('grading.graded')
                : t('grading.notSubmitted'),
            statusTone: 'muted',
            feedback: null,
            indent: true,
          });
        }
        continue;
      }
      const row = rowFor(item.itemId, item.itemType as 'assignment' | 'quiz' | 'discussion');
      if (row) rows.push(row);
    }
    return {
      groupId: g.groupId,
      name: g.groupName,
      weight: g.weight,
      raw: g.raw,
      weighted: g.weighted,
      itemsScored: g.itemsScored,
      itemCount: g.itemCount,
      rows,
    };
  });

  // Everything not referenced by a weighted category. Keeps the promise that a
  // student can see *every* gradable item, even those a teacher hasn't slotted
  // into a category yet.
  const otherRows: NormalizedRow[] = [];
  for (const a of d.assignments.items)
    if (!seen.has(a.assignmentId)) otherRows.push(norm.assignment(a));
  for (const q of d.quizzes.items) if (!seen.has(q.quizId)) otherRows.push(norm.quiz(q));
  for (const x of d.discussion.items) if (!seen.has(x.topicId)) otherRows.push(norm.discussion(x));

  const fg = d.finalGrade;
  const attendanceWeight = fg?.attendance?.weight ?? d.gradingPolicy.weightAttendance;
  const attendance: AttendanceView | null =
    d.attendance.items.length > 0 || attendanceWeight > 0
      ? {
          rate: fg?.attendance?.rate ?? null,
          weight: attendanceWeight,
          weighted: fg?.attendance?.weighted ?? 0,
          items: d.attendance.items,
        }
      : null;

  return { categories, attendance, otherRows };
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function GradeHero({ detail }: { detail: GradebookStudentDetail }): JSX.Element {
  const { t } = useTranslation();
  const fg = detail.finalGrade;
  const score = fg?.teacherOverrideScore ?? fg?.score ?? null;
  return (
    <Card className="overflow-hidden">
      <div className="bg-primary p-6 text-primary-foreground">
        <div className="text-sm font-medium uppercase tracking-wide text-primary-foreground/75">
          {t('grading.myGradebookTitle')}
        </div>
        <p className="mt-1 text-sm text-primary-foreground/75">{t('grading.myGradebookSubtitle')}</p>
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-primary-foreground/70">
              {t('grading.overallGrade')}
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-semibold tabular-nums">
                {score !== null ? score.toFixed(1) : '—'}
              </span>
              {fg?.letterGrade ? (
                <span className="rounded-md bg-primary-foreground/15 px-2.5 py-1 text-2xl font-semibold">
                  {fg.letterGrade}
                </span>
              ) : null}
            </div>
          </div>
          {!fg ? (
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="secondary">{t('grading.myGradePending')}</Badge>
            </div>
          ) : null}
        </div>
      </div>
      {fg?.teacherOverrideScore !== null && fg?.teacherOverrideScore !== undefined ? (
        <CardContent className="border-t bg-muted/40 py-3 text-sm">
          <span className="font-medium">
            {t('grading.overrideApplied', { score: fg.teacherOverrideScore.toFixed(1) })}
          </span>
          {fg.teacherOverrideReason ? (
            <p className="mt-1 text-muted-foreground">{fg.teacherOverrideReason}</p>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function CategoryCard({ category }: { category: CategoryView }): JSX.Element {
  const { t } = useTranslation();
  const progress =
    category.itemCount > 0 ? (category.itemsScored / category.itemCount) * 100 : 0;
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{category.name}</CardTitle>
          <Badge variant="info">
            {t('grading.categoryWeightLabel', { weight: category.weight })}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t('grading.raw')}:{' '}
            <span className="font-mono text-foreground">{fmt(category.raw)}</span>
          </span>
          <span>{t('grading.contributes', { weighted: fmt(category.weighted, 2) })}</span>
          <span>
            {t('grading.itemsGradedProgress', {
              scored: category.itemsScored,
              total: category.itemCount,
            })}
          </span>
        </div>
        <Progress value={progress} />
      </CardHeader>
      <CardContent className="pt-0">
        {category.rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('grading.detailNoItems')}</p>
        ) : (
          <ItemTable rows={category.rows} />
        )}
      </CardContent>
    </Card>
  );
}

function ItemTable({ rows }: { rows: NormalizedRow[] }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">{t('grading.item')}</th>
            <th className="py-2 pr-3 text-right font-medium">{t('grading.yourScore')}</th>
            <th className="py-2 pr-3 text-right font-medium">{t('grading.percent')}</th>
            <th className="py-2 font-medium">{t('grading.result')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const Icon = TYPE_ICON[row.type];
            const pct = percent(row.score, row.max);
            return (
              <tr key={row.key} className="border-b align-top last:border-0">
                <td className={cn('py-2.5 pr-3', row.indent && 'pl-6')}>
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{row.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(`grading.itemTypes.${row.type}`)}
                      </div>
                      {row.feedback ? (
                        <p className="mt-1 rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                          {row.feedback}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                  {row.score !== null ? fmt(row.score) : '—'}
                  <span className="text-muted-foreground"> / {fmt(row.max, 0)}</span>
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                  {pct !== null ? `${pct.toFixed(0)}%` : '—'}
                </td>
                <td className={cn('py-2.5 text-xs font-medium', toneClass(row.statusTone))}>
                  {row.statusLabel}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceCard({ attendance }: { attendance: AttendanceView }): JSX.Element {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t('grading.attendanceCardTitle')}</CardTitle>
          <Badge variant="info">
            {t('grading.categoryWeightLabel', { weight: attendance.weight })}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t('grading.attendanceRateLabel')}:{' '}
            <span className="font-mono text-foreground">
              {attendance.rate !== null ? `${attendance.rate.toFixed(0)}%` : '—'}
            </span>
          </span>
          <span>{t('grading.contributes', { weighted: fmt(attendance.weighted, 2) })}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {attendance.items.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('grading.detailNoItems')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t('attendance.sessionTitle')}</th>
                  <th className="py-2 pr-3 font-medium">{t('attendance.sessionDate')}</th>
                  <th className="py-2 font-medium">{t('grading.status')}</th>
                </tr>
              </thead>
              <tbody>
                {attendance.items.map((it) => (
                  <tr key={it.sessionId} className="border-b last:border-0">
                    <td className="py-2 pr-3">{it.title}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {new Date(it.sessionDate).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      {it.status ? (
                        <Badge variant={it.status === 'absent' ? 'destructive' : 'secondary'}>
                          {t(`grading.attStatus.${it.status}`)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t('grading.notRecorded')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PolicyCard({ detail }: { detail: GradebookStudentDetail }): JSX.Element {
  const { t } = useTranslation();
  const policy = detail.gradingPolicy;
  const groups = detail.finalGrade?.gradingPolicySnapshot?.groups ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('grading.policyTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <li className="flex items-center justify-between rounded-md border px-3 py-2">
            <span>{t('grading.weightAttendance')}</span>
            <span className="font-mono">{policy.weightAttendance}%</span>
          </li>
          {groups.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <span>{g.name}</span>
              <span className="font-mono">{g.weight}%</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
