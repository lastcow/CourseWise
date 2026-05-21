import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { QuizAttemptDetail, QuizQuestionStudentView, QuizQuestionTeacherView } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { useToast } from '@/components/ui/toast';
import {
  useMyQuizAttempts,
  useQuiz,
  useStartQuizAttempt,
  useSubmitQuizAttempt,
} from '@/lib/queries';
import { apiCall, pickI18nKey } from '@/lib/api';

type Question = QuizQuestionStudentView | QuizQuestionTeacherView;

function formatRemaining(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function StudentQuizRunnerPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, quizId } = useParams();
  const cid = courseId ?? '';
  const id = quizId ?? '';
  const quiz = useQuiz(id);
  const attemptsList = useMyQuizAttempts(id);
  const start = useStartQuizAttempt(id);
  const toast = useToast();

  const [attempt, setAttempt] = useState<QuizAttemptDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const submit = useSubmitQuizAttempt(attempt?.id ?? '');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const inProgress = attempt?.status === 'in_progress';
  const expiresAt = attempt?.expiresAt ? new Date(attempt.expiresAt).getTime() : null;
  const remaining = expiresAt ? expiresAt - now : null;
  const expired = remaining !== null && remaining <= 0;
  const triggeredAutoSubmit = useRef(false);

  const attemptId = attempt?.id ?? null;
  // initial seed from server-saved answers
  useEffect(() => {
    if (!attempt) return;
    const seed: Record<string, unknown> = {};
    for (const a of attempt.answers) {
      seed[a.questionId] = a.answer;
    }
    setAnswers(seed);
    // we intentionally re-seed only when a new attempt loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  // auto-submit on expiry
  useEffect(() => {
    if (!attempt || !inProgress || !expired || triggeredAutoSubmit.current) return;
    triggeredAutoSubmit.current = true;
    void (async () => {
      try {
        const result = await submit.mutateAsync({
          answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
        });
        setAttempt(result);
        toast.push({ title: t('quizzes.autoSubmitted'), tone: 'info' });
      } catch (err) {
        toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, inProgress]);

  const completed = attemptsList.data?.find(
    (a) => a.status === 'submitted' || a.status === 'expired',
  );
  const totalQuestions = attempt?.questions.length ?? 0;

  async function handleStart() {
    try {
      const result = await start.mutateAsync();
      setAttempt(result);
      triggeredAutoSubmit.current = false;
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function handleSubmit() {
    if (!attempt) return;
    if (!confirm(t('quizzes.submitConfirm'))) return;
    try {
      const result = await submit.mutateAsync({
        answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
      });
      setAttempt(result);
      toast.push({ title: t('quizzes.submitted'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function persistAnswers() {
    if (!attempt) return;
    try {
      await apiCall<QuizAttemptDetail>(`/api/quiz-attempts/${attempt.id}/answers`, {
        method: 'PATCH',
        body: {
          answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
        },
      });
      toast.push({ title: t('quizzes.draftSaved'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  const submittedReview = useMemo(() => {
    if (!attempt || attempt.status === 'in_progress') return null;
    return attempt;
  }, [attempt]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{quiz.data?.title ?? '…'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link to={`/student/courses/${cid}/quizzes`}>← {t('common.back')}</Link>
        </Button>
      </header>

      {!attempt && !completed ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('quizzes.startTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{quiz.data?.description ?? ''}</p>
            <p className="text-sm">
              {quiz.data?.timeLimitMinutes
                ? t('quizzes.timeLimitDisplay', { minutes: quiz.data.timeLimitMinutes })
                : t('quizzes.noTimeLimit')}
            </p>
            {quiz.data &&
            (quiz.data.startTime || quiz.data.endTime || quiz.data.untilDate) ? (
              <p className="text-xs text-muted-foreground">
                {quiz.data.startTime ? (
                  <span className="mr-3">
                    {t('assignments.opensOn', {
                      date: new Date(quiz.data.startTime).toLocaleString(),
                    })}
                  </span>
                ) : null}
                {quiz.data.endTime ? (
                  <span className="mr-3">
                    {t('assignments.closesOn', {
                      date: new Date(quiz.data.endTime).toLocaleString(),
                    })}
                  </span>
                ) : null}
                {quiz.data.untilDate ? (
                  <span>
                    {t('assignments.submitByLabel', {
                      date: new Date(quiz.data.untilDate).toLocaleString(),
                    })}
                  </span>
                ) : null}
              </p>
            ) : null}
            <Button onClick={handleStart}>{t('quizzes.startCta')}</Button>
          </CardContent>
        </Card>
      ) : null}

      {!attempt && completed ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('quizzes.completedTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              {t('quizzes.totalScore')}: {completed.score ?? '—'} /{' '}
              {completed.maxScore ?? '—'}
            </p>
            <p>
              {completed.teacherReviewed
                ? t('quizzes.reviewed')
                : t('quizzes.pendingReview')}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {attempt && inProgress ? (
        // `top-14` parks the bar directly under BackOfficeLayout's sticky
        // header (which is h-14 z-30); z-20 keeps the bar above content
        // but under that page header so they don't visually overlap.
        // Without these, the bar's previous `top-0 z-10` slid behind the
        // page header and disappeared on scroll.
        <div className="sticky top-14 z-20 -mx-4 flex items-center justify-between border-b bg-background/95 px-4 py-2 shadow-sm backdrop-blur">
          <span className="text-sm">
            {t('quizzes.questionsCount', { count: totalQuestions })}
          </span>
          {remaining !== null ? (
            <Badge variant={remaining < 60_000 ? 'destructive' : 'secondary'}>
              {t('quizzes.timeLeft', { time: formatRemaining(remaining) })}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {attempt
        ? attempt.questions.map((q: Question, idx) => {
            const value = answers[q.id];
            const ans = attempt.answers.find((a) => a.questionId === q.id);
            const readOnly = !inProgress;
            return (
              <Card key={q.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {/* Markdown lets prompts use newlines, lists, fenced
                        code, inline math, etc. — otherwise everything
                        collapsed to a single visual line. */}
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 tabular-nums">{idx + 1}.</span>
                      <Markdown source={q.prompt} className="leading-relaxed" />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {q.type === 'single_choice' && q.options ? (
                    <div className="space-y-1">
                      {q.options.map((opt, i) => (
                        <label key={i} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            checked={
                              Array.isArray(value) ? value.includes(i) : value === i
                            }
                            disabled={readOnly}
                            onChange={() => setAnswers({ ...answers, [q.id]: [i] })}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {q.type === 'multiple_choice' && q.options ? (
                    <div className="space-y-1">
                      {q.options.map((opt, i) => (
                        <label key={i} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Array.isArray(value) && value.includes(i)}
                            disabled={readOnly}
                            onChange={() => {
                              const set = new Set<number>(
                                Array.isArray(value) ? (value as number[]) : [],
                              );
                              if (set.has(i)) set.delete(i);
                              else set.add(i);
                              setAnswers({
                                ...answers,
                                [q.id]: Array.from(set).sort(),
                              });
                            }}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {q.type === 'true_false' ? (
                    <div className="flex gap-3">
                      {[true, false].map((v) => (
                        <label key={String(v)} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            checked={value === v}
                            disabled={readOnly}
                            onChange={() => setAnswers({ ...answers, [q.id]: v })}
                          />
                          {v ? t('quizzes.true') : t('quizzes.false')}
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {q.type === 'short_answer' ? (
                    // Even "short answer" prompts often invite multi-line
                    // replies (lists, examples, formulas). MarkdownEditor
                    // gives students the same formatting affordances the
                    // teacher used on the prompt; minHeight kept shorter
                    // than case_analysis to match the lighter weight of
                    // a short-form answer.
                    <div className="space-y-1">
                      <Label htmlFor={`q-${q.id}`}>{t('quizzes.answerLabel')}</Label>
                      <MarkdownEditor
                        id={`q-${q.id}`}
                        minHeight={120}
                        value={typeof value === 'string' ? value : ''}
                        disabled={readOnly}
                        onChange={(next) => setAnswers({ ...answers, [q.id]: next })}
                      />
                    </div>
                  ) : null}
                  {q.type === 'case_analysis' ? (
                    <div className="space-y-1">
                      <Label htmlFor={`q-${q.id}`}>{t('quizzes.answerLabel')}</Label>
                      <MarkdownEditor
                        id={`q-${q.id}`}
                        value={typeof value === 'string' ? value : ''}
                        disabled={readOnly}
                        onChange={(next) => setAnswers({ ...answers, [q.id]: next })}
                      />
                    </div>
                  ) : null}

                  {submittedReview && ans ? (
                    <div className="rounded-md border bg-muted/50 p-2 text-sm">
                      <p>
                        {t('quizzes.pointsAwarded')}: {ans.pointsAwarded ?? '—'} /{' '}
                        {q.points}
                      </p>
                      {ans.feedback ? (
                        <p>{t('quizzes.feedback')}: {ans.feedback}</p>
                      ) : null}
                      {ans.pointsAwarded === null ? (
                        <p className="text-amber-700">{t('quizzes.pendingReview')}</p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        : null}

      {attempt && inProgress ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={persistAnswers}>
            {t('quizzes.saveDraft')}
          </Button>
          <Button onClick={handleSubmit}>{t('quizzes.submitCta')}</Button>
        </div>
      ) : null}

      {submittedReview ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('quizzes.totalScore')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              {submittedReview.score ?? '—'} / {submittedReview.maxScore ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {submittedReview.teacherReviewed
                ? t('quizzes.reviewed')
                : t('quizzes.pendingReview')}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
