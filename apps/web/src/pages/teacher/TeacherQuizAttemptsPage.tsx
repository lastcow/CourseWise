import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  ListChecks,
  Mail,
  Percent,
  Sparkles,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type {
  QuizAnswerSummary,
  QuizAttemptWithStudent,
  QuizQuestionTeacherView,
} from '@coursewise/shared';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Button } from '@/components/ui/button';
import { MessageComposeDialog } from '@/components/messaging/MessageComposeDialog';
import { QuizRequirementDialog } from '@/components/quizzes/QuizRequirementDialog';
import {
  GradingNavToolbar,
  type GradingNavItem,
  type GradingNavStatus,
} from '@/components/grading/GradingNavToolbar';
import { GradingDetailLoading } from '@/components/grading/GradingDetailLoading';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { useGradeQuizAnswer, useQuiz, useQuizAttempt, useQuizAttempts } from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';
import { cn } from '@/lib/utils';

const OBJECTIVE_TYPES = new Set(['single_choice', 'multiple_choice', 'true_false']);
const isObjective = (type: string): boolean => OBJECTIVE_TYPES.has(type);
const isChoiceLike = (type: string): boolean =>
  type === 'single_choice' || type === 'multiple_choice' || type === 'true_false';

// Normalize a stored choice answer (index, [indices], or stringified) to a set
// of selected option indices.
function toIndexSet(v: unknown): Set<number> {
  const out = new Set<number>();
  const add = (x: unknown) => {
    const n = typeof x === 'number' ? x : Number.parseInt(String(x), 10);
    if (!Number.isNaN(n)) out.add(n);
  };
  if (Array.isArray(v)) v.forEach(add);
  else if (v != null) add(v);
  return out;
}

interface OptionRow {
  label: string;
  correct: boolean;
  chosen: boolean;
}

// Build the marked option rows for a choice / true-false question: each option
// flagged as the correct answer and/or the student's selection.
function buildOptionRows(
  q: QuizQuestionTeacherView,
  answer: unknown,
  trueLabel: string,
  falseLabel: string,
): OptionRow[] {
  if (q.type === 'true_false') {
    const correctTrue = q.correctAnswers === true || q.correctAnswers === 'true';
    const sv = answer == null ? null : answer === true || answer === 'true';
    return [
      { label: trueLabel, correct: correctTrue, chosen: sv === true },
      { label: falseLabel, correct: !correctTrue, chosen: sv === false },
    ];
  }
  const correct = toIndexSet(q.correctAnswers);
  const chosen = toIndexSet(answer);
  return (q.options ?? []).map((label, i) => ({
    label,
    correct: correct.has(i),
    chosen: chosen.has(i),
  }));
}

// An attempt still needs a teacher's attention when it's been handed in but not
// yet fully reviewed.
function needsGrading(a: QuizAttemptWithStudent): boolean {
  return (a.status === 'submitted' || a.status === 'expired') && !a.teacherReviewed;
}

function navStatusOf(a: QuizAttemptWithStudent): GradingNavStatus {
  if (a.status === 'in_progress') return 'inProgress';
  if (needsGrading(a)) return 'needs';
  return 'graded';
}

export function TeacherQuizAttemptsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, quizId } = useParams();
  const cid = courseId ?? '';
  const id = quizId ?? '';
  const quiz = useQuiz(id);
  const attempts = useQuizAttempts(id);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const attempt = useQuizAttempt(selectedAttemptId);
  const [composeOpen, setComposeOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const selectedAttempt = attempts.data?.find((a) => a.id === selectedAttemptId) ?? null;

  // Roster ordering: attempts awaiting grading float to the top, then by name.
  const roster = useMemo(() => {
    const list = attempts.data ?? [];
    return [...list].sort((a, b) => {
      const an = needsGrading(a) ? 0 : 1;
      const bn = needsGrading(b) ? 0 : 1;
      if (an !== bn) return an - bn;
      return a.student.name.localeCompare(b.student.name);
    });
  }, [attempts.data]);
  const toGradeCount = roster.filter(needsGrading).length;
  const rq = rosterSearch.trim().toLowerCase();
  const filteredRoster = rq
    ? roster.filter((a) => `${a.student.name} ${a.student.email}`.toLowerCase().includes(rq))
    : roster;

  const navItems: GradingNavItem[] = filteredRoster.map((a) => ({
    id: a.id,
    title: a.student.name,
    status: navStatusOf(a),
    statusLabel:
      a.status === 'in_progress'
        ? t('quizzes.attemptStatus.in_progress')
        : needsGrading(a)
          ? t('quizzes.needsGrading')
          : t('quizzes.gradedPill'),
    score: `${a.score ?? '—'} / ${a.maxScore ?? '—'}`,
  }));

  // Auto-select the first attempt once data loads (no left list to click).
  useEffect(() => {
    if (navItems.length === 0) return;
    if (selectedAttemptId && navItems.some((it) => it.id === selectedAttemptId)) return;
    setSelectedAttemptId(navItems[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navItems, selectedAttemptId]);

  const attemptsSummary =
    toGradeCount > 0 ? (
      <Badge variant="warning">{t('quizzes.toGradeCount', { count: toGradeCount })}</Badge>
    ) : roster.length > 0 ? (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" aria-hidden /> {t('quizzes.allGraded')}
      </Badge>
    ) : null;

  const d = attempt.data;
  const pct =
    d && d.score !== null && d.maxScore && d.maxScore > 0 ? (d.score / d.maxScore) * 100 : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          {t('quizzes.attemptsFor', { title: quiz.data?.title ?? '…' })}
        </h2>
        <Button asChild variant="outline" size="sm">
          <Link to={`/teacher/courses/${cid}/quizzes`}>← {t('common.back')}</Link>
        </Button>
      </header>

      <GradingNavToolbar
        search={rosterSearch}
        onSearchChange={setRosterSearch}
        searchPlaceholder={t('quizzes.attemptsSearchPlaceholder')}
        requirementsIcon={ListChecks}
        requirementsLabel={t('quizzes.viewQuiz')}
        onViewRequirements={() => setReqOpen(true)}
        requirementsDisabled={!quiz.data}
        items={navItems}
        selectedId={selectedAttemptId}
        onSelect={setSelectedAttemptId}
        summary={attemptsSummary}
      />

      <div>
        {/* Grading detail */}
        {selectedAttemptId && attempt.isLoading ? (
          <GradingDetailLoading />
        ) : !d ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={<ListChecks className="h-6 w-6" />}
                title={t('quizzes.gradingTitle')}
                description={t('quizzes.pickAttempt')}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Summary card — header band + score hero + fact tiles */}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    {t('quizzes.gradingTitle')}
                  </div>
                  <p className="mt-0.5 truncate text-lg font-semibold">
                    {selectedAttempt?.student.name ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {d.pendingReviewCount > 0 ? (
                    <Badge variant="warning" className="gap-1.5">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {t('quizzes.toGradeCount', { count: d.pendingReviewCount })}
                    </Badge>
                  ) : (
                    <Badge variant="success" className="gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.gradedPill')}
                    </Badge>
                  )}
                  {selectedAttempt ? (
                    <ActionIconButton
                      icon={Mail}
                      label={t('messages.composeCta')}
                      color="sky"
                      size="sm"
                      onClick={() => setComposeOpen(true)}
                    />
                  ) : null}
                </div>
              </div>

              <CardContent className="space-y-6 pt-6">
                {/* Score hero */}
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-semibold tabular-nums">
                      {d.score ?? '—'}
                      <span className="text-2xl text-muted-foreground"> / {d.maxScore ?? '—'}</span>
                    </span>
                    {pct !== null ? (
                      <span className="text-lg font-medium tabular-nums text-muted-foreground">
                        {pct.toFixed(0)}%
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        d.pendingReviewCount > 0 ? 'bg-amber-400' : 'bg-emerald-500',
                      )}
                      style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }}
                    />
                  </div>
                  {d.pendingReviewCount > 0 ? (
                    <p className="mt-2 text-sm text-amber-700">{t('quizzes.gradingPendingHint')}</p>
                  ) : null}
                </div>

                {/* Fact tiles */}
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Fact
                    icon={Percent}
                    label={t('quizzes.resultPercent')}
                    value={pct !== null ? `${pct.toFixed(0)}%` : '—'}
                  />
                  <Fact
                    icon={ListChecks}
                    label={t('quizzes.metaQuestions')}
                    value={String(d.questions.length)}
                  />
                  <Fact
                    icon={Clock}
                    label={t('quizzes.toGrade')}
                    value={String(d.pendingReviewCount)}
                  />
                  <Fact
                    icon={CalendarClock}
                    label={t('quizzes.resultSubmitted')}
                    value={d.submittedAt ? formatSubmittedAt(d.submittedAt) : '—'}
                    className="sm:col-span-2"
                  />
                </dl>
              </CardContent>
            </Card>

            {/* Per-question grading */}
            {d.questions.map((q, idx) => {
              const tq = q as QuizQuestionTeacherView;
              const ans = d.answers.find((a) => a.questionId === q.id) ?? null;
              return (
                <QuestionGradeCard
                  key={q.id}
                  index={idx}
                  question={tq}
                  answer={ans}
                  attemptId={selectedAttemptId ?? ''}
                  quizId={id}
                />
              );
            })}
          </div>
        )}
      </div>

      {composeOpen && selectedAttempt ? (
        <MessageComposeDialog
          open
          onClose={() => setComposeOpen(false)}
          courseId={cid}
          recipientId={selectedAttempt.student.id}
          recipientName={selectedAttempt.student.name}
          initialSubject={t('messages.aboutQuiz', { title: quiz.data?.title ?? '' })}
          contextLine={t('messages.contextQuiz', { title: quiz.data?.title ?? '' })}
        />
      ) : null}

      {quiz.data ? (
        <QuizRequirementDialog
          quiz={quiz.data}
          open={reqOpen}
          onClose={() => setReqOpen(false)}
        />
      ) : null}
    </div>
  );
}

// Compact date + h:mm (no seconds), e.g. "Jun 6, 9:35 AM".
function formatSubmittedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Fact({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('rounded-md border bg-card p-3', className)}>
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 truncate text-base font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

// One question + the student's answer + the grading controls. Objective
// questions arrive auto-graded (correct/incorrect); free-text questions start
// ungraded and need a score. Self-contained draft state with a dirty check so
// Save only fires real changes.
function QuestionGradeCard({
  index,
  question: q,
  answer: ans,
  attemptId,
  quizId,
}: {
  index: number;
  question: QuizQuestionTeacherView;
  answer: QuizAnswerSummary | null;
  attemptId: string;
  quizId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const grade = useGradeQuizAnswer(attemptId, quizId);
  const toast = useToast();
  const objective = isObjective(q.type);

  const savedPoints = ans?.pointsAwarded != null ? String(ans.pointsAwarded) : '';
  const savedFeedback = ans?.feedback ?? '';
  const [points, setPoints] = useState(savedPoints);
  const [feedback, setFeedback] = useState(savedFeedback);
  // Re-seed whenever the underlying answer changes (attempt switch or save).
  useEffect(() => {
    setPoints(savedPoints);
    setFeedback(savedFeedback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ans?.id, ans?.pointsAwarded, ans?.feedback]);

  const dirty = points !== savedPoints || feedback !== savedFeedback;
  const graded = ans?.pointsAwarded != null;
  const correct = ans?.isCorrect === true;
  const incorrect = ans?.isCorrect === false;

  // Status accent for the card.
  const status: 'correct' | 'incorrect' | 'pending' | 'graded' = !graded
    ? 'pending'
    : correct
      ? 'correct'
      : incorrect
        ? 'incorrect'
        : 'graded';
  const StatusIcon: LucideIcon =
    status === 'correct'
      ? CheckCircle2
      : status === 'incorrect'
        ? XCircle
        : status === 'pending'
          ? Clock
          : CheckCircle2;
  const statusIconClass =
    status === 'correct'
      ? 'text-emerald-500'
      : status === 'incorrect'
        ? 'text-red-500'
        : status === 'pending'
          ? 'text-amber-500'
          : 'text-emerald-500';

  async function onSave(): Promise<void> {
    if (!ans) return;
    try {
      await grade.mutateAsync({
        id: ans.id,
        input: {
          pointsAwarded: Number(points) || 0,
          feedback: feedback.trim() || null,
        },
      });
      toast.push({ title: t('quizzes.graded'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  const hasAnswer = ans?.answer != null && ans.answer !== '';

  return (
    <Card>
      <CardHeader className="space-y-2.5">
        {/* Meta row: status + number + type, with points on the right */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <StatusIcon className={cn('h-4 w-4 shrink-0', statusIconClass)} aria-hidden />
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {t('quizzes.questionN', { n: index + 1 })}
            </span>
            <Badge variant="outline">{t(`quizzes.type.${q.type}`)}</Badge>
            {objective ? (
              <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                <Sparkles className="h-3 w-3" aria-hidden /> {t('quizzes.autoGraded')}
              </span>
            ) : null}
          </div>
          <div className="shrink-0 font-mono text-lg font-semibold tabular-nums">
            {ans?.pointsAwarded ?? '—'}
            <span className="text-sm text-muted-foreground"> / {q.points}</span>
          </div>
        </div>
        {/* Prompt as a block so long / multi-line prompts wrap cleanly */}
        <CardTitle className="text-base font-medium">
          <Markdown source={q.prompt} className="leading-relaxed" />
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Answer area — tailored per question type */}
        {isChoiceLike(q.type) ? (
          <OptionList rows={buildOptionRows(q, ans?.answer, t('quizzes.true'), t('quizzes.false'))} />
        ) : (
          <div>
            <Label className="text-muted-foreground">{t('quizzes.studentAnswer')}</Label>
            <div className="mt-1 rounded-md border bg-muted/40 p-3 text-sm">
              {hasAnswer && typeof ans!.answer === 'string' ? (
                <Markdown source={ans!.answer} className="leading-relaxed" />
              ) : hasAnswer ? (
                String(ans!.answer)
              ) : (
                <span className="italic text-muted-foreground">{t('quizzes.noAnswer')}</span>
              )}
            </div>
          </div>
        )}

        {/* Rubric / explanation: a marking aid for the teacher */}
        {q.explanation ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-3 text-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              {isObjective(q.type)
                ? t('quizzes.explanationLabel')
                : t('quizzes.markingGuideLabel')}
            </div>
            <div className="mt-1.5">
              <Markdown source={q.explanation} className="leading-relaxed" />
            </div>
          </div>
        ) : null}

      </CardContent>

      {/* Grading controls live in the footer. Row 1: feedback, full width.
          Row 2: points (label inline with the field) and the Save action. The
          awarded total already shows on the question header. */}
      <CardFooter className="flex-col items-stretch gap-3 border-t bg-muted/20 pt-4">
        <div>
          <Label htmlFor={`fb-${q.id}`}>{t('quizzes.feedback')}</Label>
          <Textarea
            id={`fb-${q.id}`}
            rows={2}
            className="w-full"
            value={feedback}
            disabled={!ans}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`pts-${q.id}`} className="shrink-0">
            {t('quizzes.pointsLabel')}
          </Label>
          <Input
            id={`pts-${q.id}`}
            type="number"
            min={0}
            max={q.points}
            step={0.5}
            className="w-20"
            value={points}
            disabled={!ans}
            onChange={(e) => setPoints(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">/ {q.points}</span>
          <div className="ml-auto flex items-center gap-2">
            {!dirty && graded ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.savedTick')}
              </span>
            ) : null}
            <Button size="sm" disabled={!ans || !dirty || grade.isPending} onClick={onSave}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

// Marked option list for choice / true-false questions: the student's pick(s)
// and the correct answer(s) shown inline against the full option set.
function OptionList({ rows }: { rows: OptionRow[] }): JSX.Element {
  const { t } = useTranslation();
  const noneChosen = rows.every((r) => !r.chosen);
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const tone = r.chosen && r.correct
          ? 'correct'
          : r.chosen && !r.correct
            ? 'wrong'
            : !r.chosen && r.correct
              ? 'missed'
              : 'neutral';
        const Icon =
          tone === 'correct' ? CheckCircle2 : tone === 'wrong' ? XCircle : tone === 'missed' ? CheckCircle2 : Circle;
        const box =
          tone === 'correct'
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950'
            : tone === 'wrong'
              ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950'
              : tone === 'missed'
                ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60'
                : 'border-border';
        const iconClass =
          tone === 'correct' || tone === 'missed'
            ? 'text-emerald-500'
            : tone === 'wrong'
              ? 'text-red-500'
              : 'text-muted-foreground/40';
        return (
          <div
            key={i}
            className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-sm', box)}
          >
            <Icon className={cn('h-4 w-4 shrink-0', iconClass)} aria-hidden />
            <span className="min-w-0 flex-1">{r.label}</span>
            {r.chosen ? (
              <Badge variant="outline" className="shrink-0">
                {t('quizzes.yourAnswer')}
              </Badge>
            ) : null}
            {r.correct ? (
              <Badge variant="success" className="shrink-0">
                {t('quizzes.correctTag')}
              </Badge>
            ) : null}
          </div>
        );
      })}
      {noneChosen ? (
        <p className="text-xs italic text-muted-foreground">{t('quizzes.noAnswer')}</p>
      ) : null}
    </div>
  );
}
