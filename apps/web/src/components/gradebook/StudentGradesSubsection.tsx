import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Check, Eye, Loader2, Users } from 'lucide-react';
import type {
  GradebookAssignmentItem,
  GradebookDiscussionItem,
  GradebookQuizItem,
} from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  useGradeDiscussion,
  useGradeStudentScore,
  useGradeSubmission,
  useGradebookStudentDetail,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ItemDetailDialog, type GradebookItemTarget } from './ItemDetailDialog';

// Hide the number spinner — the score reads as "x / max" and the arrows add noise.
const SCORE_INPUT_CLASS =
  'h-8 w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden';

const fmtScore = (n: number | null): string => (n !== null ? String(n) : '');

function submissionStatusVariant(s: string): 'success' | 'warning' | 'info' | 'secondary' {
  if (s === 'graded') return 'success';
  if (s === 'late' || s === 'submitted') return 'warning';
  if (s === 'returned') return 'info';
  return 'secondary';
}

const submissionStatusLabel = (t: (k: string) => string, s: string): string =>
  t(`submissions.status${s[0]!.toUpperCase()}${s.slice(1)}`);

// After an inline save the roster score (compute-on-read) and this student's
// detail both need to refresh so the change is reflected everywhere.
async function refreshGradebook(
  qc: QueryClient,
  courseId: string,
  studentId: string,
): Promise<void> {
  await qc.invalidateQueries({ queryKey: ['gradebook-student-detail', courseId, studentId] });
  await qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
}

/**
 * A numeric grade field that auto-saves when it loses focus (blur) or on Enter,
 * with an inline saving/saved indicator. Esc reverts. Empty never clears an
 * existing grade; out-of-range values are rejected with a toast.
 */
function InlineScoreField({
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

function ItemRow({
  title,
  isGroup,
  badges,
  action,
  right,
  highlight,
}: {
  title: string;
  isGroup?: boolean;
  badges?: ReactNode;
  action?: ReactNode;
  right: ReactNode;
  highlight?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        // A transparent left rail keeps content aligned whether or not a row is
        // highlighted; ungraded submissions light it amber with a faint tint.
        'flex items-start justify-between gap-3 border-l-2 border-l-transparent px-3 py-2',
        highlight && 'border-l-amber-400 bg-amber-50/60 dark:bg-amber-950/20',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          {/* Title is allowed to wrap onto multiple lines. */}
          <span className="text-sm">{title}</span>
          {isGroup ? (
            <Users
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-label={t('grading.groupSubmissionHint')}
            />
          ) : null}
        </div>
        {badges || action ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
            {action}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{right}</div>
    </div>
  );
}

function InlineAssignmentRow({
  courseId,
  studentId,
  item,
  onOpen,
}: {
  courseId: string;
  studentId: string;
  item: GradebookAssignmentItem;
  onOpen: (target: GradebookItemTarget) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const grade = useGradeSubmission(item.assignmentId);
  const gradeDirect = useGradeStudentScore(item.assignmentId);

  const commit = async (score: number): Promise<void> => {
    // Pass stored feedback through so a score-only save doesn't wipe it.
    if (item.submissionId) {
      await grade.mutateAsync({
        id: item.submissionId,
        input: { score, feedback: item.feedback ?? null },
      });
    } else {
      await gradeDirect.mutateAsync({
        studentId,
        input: { score, feedback: item.feedback ?? null },
      });
    }
    await refreshGradebook(qc, courseId, studentId);
  };

  // Handed in but not yet graded — the row to draw the teacher's eye to.
  const needsGrading = item.status === 'submitted' || item.status === 'late';

  const badges = (
    <>
      {item.zeroedAsMissing ? <Badge variant="warning">{t('grading.pastDueBadge')}</Badge> : null}
      {item.status ? (
        <Badge variant={submissionStatusVariant(item.status)}>
          {submissionStatusLabel(t, item.status)}
        </Badge>
      ) : null}
    </>
  );

  return (
    <ItemRow
      title={item.title}
      isGroup={item.isGroup}
      highlight={needsGrading}
      badges={item.zeroedAsMissing || item.status ? badges : null}
      action={
        item.submissionId ? (
          <button
            type="button"
            onClick={() =>
              onOpen({
                kind: 'assignment',
                title: item.title,
                submissionId: item.submissionId!,
                maxScore: item.maxScore,
              })
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 transition-colors hover:text-sky-700 hover:underline focus-visible:outline-none focus-visible:underline dark:text-sky-400 dark:hover:text-sky-300"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden />
            {t('grading.openSubmission')}
          </button>
        ) : null
      }
      right={
        <InlineScoreField
          initial={item.score}
          maxScore={item.maxScore}
          placeholder={item.submissionId ? undefined : t('grading.detailNoSubmission')}
          onCommit={commit}
        />
      }
    />
  );
}

function InlineDiscussionRow({
  courseId,
  studentId,
  item,
}: {
  courseId: string;
  studentId: string;
  item: GradebookDiscussionItem;
}): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const grade = useGradeDiscussion(item.topicId);

  const commit = async (score: number): Promise<void> => {
    await grade.mutateAsync({ studentId, input: { score, feedback: item.feedback ?? null } });
    await refreshGradebook(qc, courseId, studentId);
  };

  const badges = item.zeroedAsMissing ? (
    <Badge variant="warning">{t('grading.pastDueBadge')}</Badge>
  ) : item.postCount > 0 ? (
    item.score !== null ? (
      <Badge variant="success">{t('grading.graded')}</Badge>
    ) : (
      <Badge variant="warning">{t('grading.awaitingGrade')}</Badge>
    )
  ) : null;

  return (
    <ItemRow
      title={item.title}
      badges={badges}
      right={
        <InlineScoreField initial={item.score} maxScore={item.maxScore} onCommit={commit} />
      }
    />
  );
}

function InlineQuizRow({
  courseId,
  item,
}: {
  courseId: string;
  item: GradebookQuizItem;
}): JSX.Element {
  const { t } = useTranslation();
  const badges =
    item.attemptId && item.status ? (
      <Badge
        variant={
          item.status === 'submitted'
            ? item.pendingReviewCount > 0
              ? 'warning'
              : 'success'
            : item.status === 'in_progress'
              ? 'warning'
              : 'secondary'
        }
      >
        {t(`quizzes.attemptStatus.${item.status}`)}
      </Badge>
    ) : item.zeroedAsMissing ? (
      <Badge variant="warning">{t('grading.pastDueBadge')}</Badge>
    ) : null;

  return (
    <ItemRow
      title={item.title}
      badges={badges}
      right={
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
            {item.score !== null ? item.score : '—'} / {item.maxScore ?? '—'}
          </span>
          {item.attemptId ? (
            <Link
              to={`/teacher/courses/${courseId}/quizzes/${item.quizId}/attempts`}
              className="whitespace-nowrap text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
            >
              {t('grading.detailReviewQuiz')}
            </Link>
          ) : null}
        </div>
      }
    />
  );
}

function CategoryBlock({
  title,
  show,
  children,
}: {
  title: string;
  show: boolean;
  children: ReactNode;
}): JSX.Element | null {
  if (!show) return null;
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h4>
      <div className="divide-y divide-border/70 overflow-hidden rounded-md border bg-card">
        {children}
      </div>
    </section>
  );
}

/**
 * Inline, per-student gradebook subsection rendered when a roster row is
 * expanded. Lists every gradable item (assignments, final project, discussion,
 * quizzes) with inline score fields that auto-save on blur. Attendance is not
 * included; quizzes are read-only (graded via attempt review).
 */
export function StudentGradesSubsection({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const detail = useGradebookStudentDetail(courseId, studentId);
  const [target, setTarget] = useState<GradebookItemTarget | null>(null);

  if (detail.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return <p className="text-sm text-muted-foreground">{t('errors.internal')}</p>;
  }

  const d = detail.data;
  const empty =
    d.assignments.items.length === 0 &&
    d.finalProject.items.length === 0 &&
    d.discussion.items.length === 0 &&
    d.quizzes.items.length === 0;

  if (empty) {
    return <p className="text-sm text-muted-foreground">{t('grading.detailNoItems')}</p>;
  }

  return (
    <div className="space-y-4">
      <CategoryBlock title={t('grading.detailAssignmentsTitle')} show={d.assignments.items.length > 0}>
        {d.assignments.items.map((it) => (
          <InlineAssignmentRow
            key={it.assignmentId}
            courseId={courseId}
            studentId={studentId}
            item={it}
            onOpen={setTarget}
          />
        ))}
      </CategoryBlock>
      <CategoryBlock
        title={t('grading.detailFinalProjectTitle')}
        show={d.finalProject.items.length > 0}
      >
        {d.finalProject.items.map((it) => (
          <InlineAssignmentRow
            key={it.assignmentId}
            courseId={courseId}
            studentId={studentId}
            item={it}
            onOpen={setTarget}
          />
        ))}
      </CategoryBlock>
      <CategoryBlock title={t('grading.detailDiscussionTitle')} show={d.discussion.items.length > 0}>
        {d.discussion.items.map((it) => (
          <InlineDiscussionRow
            key={it.topicId}
            courseId={courseId}
            studentId={studentId}
            item={it}
          />
        ))}
      </CategoryBlock>
      <CategoryBlock title={t('grading.detailQuizzesTitle')} show={d.quizzes.items.length > 0}>
        {d.quizzes.items.map((it) => (
          <InlineQuizRow key={it.quizId} courseId={courseId} item={it} />
        ))}
      </CategoryBlock>
      {target ? <ItemDetailDialog target={target} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}
