import type * as React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileQuestion,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Paperclip,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type {
  QuizAnswerSummary,
  QuizAttemptStatus,
  SubmissionStatus,
} from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MarkdownView } from '@/components/ui/markdown';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { getDownloadUrl, useQuizAttempt, useStudentPosts, useSubmission } from '@/lib/queries';
import { cn } from '@/lib/utils';

/**
 * Read-only "view details" dialog for rows on the teacher's per-student
 * gradebook page. One dialog instance lives at page level; the row that was
 * clicked describes itself through this target union and the dialog lazily
 * fetches the underlying content (submission text, quiz answers, posts).
 */
export type GradebookItemTarget =
  | { kind: 'assignment'; title: string; submissionId: string; maxScore: number }
  | { kind: 'quiz'; title: string; quizId: string; attemptId: string; courseId: string }
  | {
      kind: 'discussion';
      title: string;
      topicId: string;
      studentId: string;
      maxScore: number;
      score: number | null;
      feedback: string | null;
    };

export function ItemDetailDialog({
  target,
  onClose,
}: {
  target: GradebookItemTarget;
  onClose: () => void;
}): JSX.Element {
  return (
    <Dialog open onClose={onClose} className="max-w-2xl p-0">
      {target.kind === 'assignment' ? (
        <AssignmentBody target={target} />
      ) : target.kind === 'quiz' ? (
        <QuizBody target={target} />
      ) : (
        <DiscussionBody target={target} />
      )}
    </Dialog>
  );
}

// Compact date + h:mm (no seconds), e.g. "Jun 6, 9:35 AM".
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ------------------- Shared dialog building blocks -------------------

/** Header band + scrollable body, mirroring the grading pages' detail card. */
function Shell({
  icon: Icon,
  kicker,
  title,
  badges,
  children,
}: {
  icon: LucideIcon;
  kicker: string;
  title: string;
  badges?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg">
      <div className="border-b bg-muted/30 py-4 pl-6 pr-12">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {kicker}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          {badges}
        </div>
      </div>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-6">{children}</div>
    </div>
  );
}

function ScoreBand({
  score,
  max,
  pending,
  note,
}: {
  score: number | null;
  max: number | null;
  pending: boolean;
  note?: React.ReactNode;
}): JSX.Element {
  const pct = score !== null && max && max > 0 ? (score / max) * 100 : null;
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">
          {score !== null ? +score.toFixed(1) : '—'}
        </span>
        <span className="text-sm text-muted-foreground">/ {max ?? '—'}</span>
        {pct !== null ? (
          <span className="ml-auto text-sm font-medium tabular-nums text-muted-foreground">
            {Math.round(pct)}%
          </span>
        ) : null}
      </div>
      <Progress
        value={pct ?? 0}
        className="mt-2 h-2"
        barClassName={pending ? 'bg-amber-400' : 'bg-emerald-500'}
      />
      {note}
    </div>
  );
}

function FeedbackBlock({ feedback }: { feedback: string | null }): JSX.Element | null {
  const { t } = useTranslation();
  if (!feedback) return null;
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        {t('grading.detailDialogFeedback')}
      </div>
      <MarkdownView source={feedback} className="mt-1.5 text-sm leading-relaxed" />
    </div>
  );
}

function FactLine({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <p className="rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm italic text-muted-foreground">
      {children}
    </p>
  );
}

function LoadingNote(): JSX.Element {
  const { t } = useTranslation();
  return <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>;
}

// ------------------- Assignment -------------------

function submissionStatusVariant(s: SubmissionStatus): 'success' | 'warning' | 'secondary' {
  if (s === 'graded') return 'success';
  if (s === 'late' || s === 'submitted') return 'warning';
  return 'secondary';
}

function AssignmentBody({
  target,
}: {
  target: Extract<GradebookItemTarget, { kind: 'assignment' }>;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const sub = useSubmission(target.submissionId);
  const s = sub.data;

  const onDownload = async (fileId: string): Promise<void> => {
    try {
      const r = await getDownloadUrl(fileId);
      window.open(r.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    }
  };

  return (
    <Shell
      icon={ClipboardList}
      kicker={t('grading.itemTypes.assignment')}
      title={target.title}
      badges={
        s ? (
          <Badge variant={submissionStatusVariant(s.status)}>
            {t(`submissions.status${s.status[0]!.toUpperCase()}${s.status.slice(1)}`)}
          </Badge>
        ) : null
      }
    >
      {!s ? (
        <LoadingNote />
      ) : (
        <>
          <ScoreBand
            score={s.score}
            max={target.maxScore}
            pending={s.score === null}
            note={
              s.latePenaltyPercent != null && s.latePenaltyPercent > 0 ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  {t('submissions.latePenaltyBadge', { pct: s.latePenaltyPercent })}
                  {s.rawScore !== null ? ` · ${t('grading.raw')}: ${+s.rawScore.toFixed(1)}` : ''}
                </p>
              ) : null
            }
          />
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {s.submittedAt ? (
              <FactLine
                icon={CalendarClock}
                label={t('grading.detailDialogSubmittedAt')}
                value={formatDateTime(s.submittedAt)}
              />
            ) : null}
            {s.gradedAt ? (
              <FactLine
                icon={CheckCircle2}
                label={t('grading.detailDialogGradedAt')}
                value={formatDateTime(s.gradedAt)}
              />
            ) : null}
          </div>
          <FeedbackBlock feedback={s.feedback} />
          <div className="space-y-2">
            <SectionLabel icon={ClipboardList}>{t('grading.detailDialogSubmission')}</SectionLabel>
            {s.textAnswer ? (
              <MarkdownView
                source={s.textAnswer}
                className="rounded-md border bg-muted/20 p-3 text-sm leading-relaxed"
              />
            ) : null}
            {s.attachments.length > 0 ? (
              <ul className="space-y-1.5">
                {s.attachments.map((att) => (
                  <li key={att.fileAssetId}>
                    <button
                      type="button"
                      onClick={() => void onDownload(att.fileAssetId)}
                      className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        {att.filename ?? att.fileAssetId}
                      </span>
                      {att.sizeBytes != null ? (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {(att.sizeBytes / 1024).toFixed(0)} KB
                        </span>
                      ) : null}
                      <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!s.textAnswer && s.attachments.length === 0 ? (
              <EmptyNote>{t('grading.detailDialogNoContent')}</EmptyNote>
            ) : null}
          </div>
        </>
      )}
    </Shell>
  );
}

// ------------------- Quiz -------------------

function attemptStatusVariant(s: QuizAttemptStatus): 'success' | 'warning' | 'secondary' {
  if (s === 'submitted') return 'success';
  if (s === 'in_progress') return 'warning';
  return 'secondary';
}

// Normalize a stored choice answer (index, [indices], or stringified) to a set
// of selected option indices. Mirrors the helper on the quiz attempts page.
function toIndexSet(v: unknown): Set<number> {
  const out = new Set<number>();
  const add = (x: unknown): void => {
    const n = typeof x === 'number' ? x : Number.parseInt(String(x), 10);
    if (!Number.isNaN(n)) out.add(n);
  };
  if (Array.isArray(v)) v.forEach(add);
  else if (v != null) add(v);
  return out;
}

function QuizBody({
  target,
}: {
  target: Extract<GradebookItemTarget, { kind: 'quiz' }>;
}): JSX.Element {
  const { t } = useTranslation();
  const attempt = useQuizAttempt(target.attemptId);
  const a = attempt.data;

  return (
    <Shell
      icon={FileQuestion}
      kicker={t('grading.itemTypes.quiz')}
      title={target.title}
      badges={
        a ? (
          <>
            <Badge variant={attemptStatusVariant(a.status)}>
              {t(`quizzes.attemptStatus.${a.status}`)}
            </Badge>
            {a.pendingReviewCount > 0 ? (
              <Badge variant="warning">{t('quizzes.pendingReview')}</Badge>
            ) : a.teacherReviewed ? (
              <Badge variant="success">{t('quizzes.reviewed')}</Badge>
            ) : null}
          </>
        ) : null
      }
    >
      {!a ? (
        <LoadingNote />
      ) : (
        <>
          <ScoreBand score={a.score} max={a.maxScore} pending={a.pendingReviewCount > 0} />
          {a.submittedAt ? (
            <div>
              <FactLine
                icon={CalendarClock}
                label={t('grading.detailDialogSubmittedAt')}
                value={formatDateTime(a.submittedAt)}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <SectionLabel icon={ListChecks}>{t('grading.detailDialogAnswers')}</SectionLabel>
            <ul className="space-y-2">
              {a.questions.map((q, idx) => {
                const ans = a.answers.find((x) => x.questionId === q.id) ?? null;
                return (
                  <li key={q.id}>
                    <QuestionAnswerRow index={idx} question={q} answer={ans} />
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex justify-end border-t pt-4">
            <Link to={`/teacher/courses/${target.courseId}/quizzes/${target.quizId}/attempts`}>
              <Button variant="outline" size="sm">
                {t('grading.detailDialogOpenFullReview')}
              </Button>
            </Link>
          </div>
        </>
      )}
    </Shell>
  );
}

function QuestionAnswerRow({
  index,
  question: q,
  answer: ans,
}: {
  index: number;
  question: { id: string; prompt: string; type: string; options: string[] | null; points: number };
  answer: QuizAnswerSummary | null;
}): JSX.Element {
  const { t } = useTranslation();
  const graded = ans?.pointsAwarded != null;
  const status: 'correct' | 'incorrect' | 'pending' | 'graded' = !graded
    ? 'pending'
    : ans?.isCorrect === true
      ? 'correct'
      : ans?.isCorrect === false
        ? 'incorrect'
        : 'graded';
  const StatusIcon: LucideIcon =
    status === 'incorrect' ? XCircle : status === 'pending' ? Clock : CheckCircle2;
  const iconClass =
    status === 'incorrect'
      ? 'text-red-500'
      : status === 'pending'
        ? 'text-amber-500'
        : 'text-emerald-500';

  // Read-only answer text: chosen option labels for choice questions,
  // True/False label, or the free-text answer rendered as markdown.
  let answerNode: React.ReactNode;
  const raw = ans?.answer;
  if (raw == null || raw === '') {
    answerNode = (
      <span className="italic text-muted-foreground">{t('grading.detailDialogNoAnswer')}</span>
    );
  } else if (q.type === 'true_false') {
    answerNode =
      raw === true || raw === 'true' ? t('quizzes.true') : t('quizzes.false');
  } else if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    const chosen = toIndexSet(raw);
    const labels = (q.options ?? []).filter((_, i) => chosen.has(i));
    answerNode = labels.length > 0 ? labels.join(' · ') : String(raw);
  } else if (typeof raw === 'string') {
    answerNode = <MarkdownView source={raw} className="leading-relaxed" />;
  } else {
    answerNode = String(raw);
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon className={cn('h-4 w-4 shrink-0', iconClass)} aria-hidden />
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
            {t('quizzes.questionN', { n: index + 1 })}
          </span>
        </div>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
          {ans?.pointsAwarded ?? '—'}
          <span className="font-normal text-muted-foreground"> / {q.points}</span>
        </span>
      </div>
      <MarkdownView source={q.prompt} className="mt-1.5 text-sm leading-relaxed" />
      <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-sm">{answerNode}</div>
      {ans?.feedback ? (
        <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">{ans.feedback}</p>
      ) : null}
    </div>
  );
}

// ------------------- Discussion -------------------

function DiscussionBody({
  target,
}: {
  target: Extract<GradebookItemTarget, { kind: 'discussion' }>;
}): JSX.Element {
  const { t } = useTranslation();
  const posts = useStudentPosts(target.topicId, target.studentId);
  const mine = posts.data?.posts ?? [];

  return (
    <Shell
      icon={MessagesSquare}
      kicker={t('grading.itemTypes.discussion')}
      title={target.title}
      badges={
        target.score !== null ? (
          <Badge variant="success">{t('grading.graded')}</Badge>
        ) : (
          <Badge variant="warning">{t('grading.awaitingGrade')}</Badge>
        )
      }
    >
      <ScoreBand score={target.score} max={target.maxScore} pending={target.score === null} />
      <FeedbackBlock feedback={target.feedback} />
      <div className="space-y-2">
        <SectionLabel icon={MessagesSquare}>
          {t('grading.detailDialogPosts')}
          {posts.data ? ` · ${mine.length}` : ''}
        </SectionLabel>
        {posts.isLoading ? (
          <LoadingNote />
        ) : mine.length === 0 ? (
          <EmptyNote>{t('grading.detailDialogNoPosts')}</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {mine.map((p) => (
              <li key={p.id} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</div>
                <MarkdownView source={p.content} className="mt-1.5 text-sm leading-relaxed" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
