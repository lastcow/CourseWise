import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  Circle,
  CircleCheck,
  Clock,
  FileText,
  ListChecks,
  Lock,
  Play,
  Repeat,
  ShieldCheck,
  Target,
  Trophy,
} from 'lucide-react';
import type {
  QuizAttemptDetail,
  QuizQuestionStudentView,
  QuizQuestionTeacherView,
  QuizSummary,
} from '@coursewise/shared';
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
import { useNow } from '@/lib/useNow';

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

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Pre-attempt "assessment briefing" — the cover sheet a student reads before an
 * attempt exists. The full Markdown briefing stays readable in every state; only
 * the Start action is gated. Four mutually-exclusive states drive the action zone:
 *
 *   - `unavailable` (draft)          — calm slate notice, no action
 *   - `closed` (closed/archived/past endTime) — calm slate notice, no action
 *   - `locked` (published, before startTime)  — amber panel + live d/h/m/s
 *                                                countdown, disabled Start
 *   - `ready` (published, inside the window)   — emerald ground rules + Start
 *
 * `now` is supplied by the page's single per-second clock, so the countdown
 * ticks and the state flips to `ready` the instant startTime passes — no second
 * timer, and no hooks are called conditionally (this whole card is conditionally
 * *mounted* by the parent).
 */
function QuizPreStartCard({
  quiz: q,
  now,
  gate,
  onStart,
  starting,
}: {
  quiz: QuizSummary | undefined;
  now: number;
  gate: { disabled: boolean; reason: string };
  onStart: () => void;
  starting: boolean;
}): JSX.Element {
  const { t } = useTranslation();

  const loading = !q;
  const startMs = q?.startTime ? Date.parse(q.startTime) : null;
  const endMs = q?.endTime ? Date.parse(q.endTime) : null;
  const untilMs = q?.untilDate ? Date.parse(q.untilDate) : null;

  const notYetOpen = startMs !== null && now < startMs;
  const windowClosed = endMs !== null && now >= endMs;

  // Mutually-exclusive presentation state. Reserve `unavailable` for an
  // unpublished draft; an explicitly closed/archived quiz (or one past its
  // window) reads as the calmer `closed`, never "Unavailable".
  type Phase = 'loading' | 'unavailable' | 'closed' | 'locked' | 'ready';
  const phase: Phase = !q
    ? 'loading'
    : q.status === 'draft'
      ? 'unavailable'
      : q.status === 'closed' || q.status === 'archived' || windowClosed
        ? 'closed'
        : notYetOpen
          ? 'locked'
          : 'ready';

  // Live countdown to the moment the quiz opens.
  const opensInMs = startMs !== null ? Math.max(0, startMs - now) : 0;
  const totalSec = Math.floor(opensInMs / 1000);
  const cd = {
    d: Math.floor(totalSec / 86400),
    h: Math.floor((totalSec % 86400) / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const opensInShort =
    cd.d > 0 ? `${cd.d}d ${cd.h}h` : cd.h > 0 ? `${cd.h}h ${cd.m}m` : `${cd.m}m ${cd.s}s`;
  const segments = [
    { v: cd.d, u: t('quizzes.countdownDays') },
    { v: cd.h, u: t('quizzes.countdownHours') },
    { v: cd.m, u: t('quizzes.countdownMinutes') },
    { v: cd.s, u: t('quizzes.countdownSeconds') },
  ];

  // Boxed facts. Missing values degrade to an em dash; the time-limit and
  // attempts cells render words rather than a misleading bare number.
  const facts = [
    {
      icon: ListChecks,
      label: t('quizzes.metaQuestions'),
      value: q?.questionCount != null ? String(q.questionCount) : '—',
    },
    {
      icon: Clock,
      label: t('quizzes.metaTimeLimit'),
      value: q?.timeLimitMinutes
        ? t('quizzes.metaMinutes', { minutes: q.timeLimitMinutes })
        : loading
          ? '—'
          : t('quizzes.metaNoLimit'),
    },
    {
      icon: Trophy,
      label: t('quizzes.metaPoints'),
      value: q?.maxScore != null ? String(q.maxScore) : '—',
    },
    {
      icon: Target,
      label: t('quizzes.metaPassing'),
      value: q?.passingScore != null ? String(q.passingScore) : '—',
    },
    {
      icon: Repeat,
      label: t('quizzes.metaAttempts'),
      value: q ? String(q.maxAttempts) : '—',
    },
  ];

  // Availability stops, past ones marked done (emerald check).
  const stops = [
    q?.startTime
      ? {
          label: t('quizzes.timelineOpens'),
          iso: q.startTime,
          done: startMs !== null && now >= startMs,
        }
      : null,
    q?.endTime
      ? { label: t('quizzes.timelineCloses'), iso: q.endTime, done: endMs !== null && now >= endMs }
      : null,
    q?.untilDate
      ? {
          label: t('quizzes.timelineSubmitBy'),
          iso: q.untilDate,
          done: untilMs !== null && now >= untilMs,
        }
      : null,
  ].filter(Boolean) as { label: string; iso: string; done: boolean }[];

  // Ground rules shown in the `ready` state so starting feels deliberate.
  const rules = q
    ? ([
        q.timeLimitMinutes
          ? t('quizzes.ruleTimer', { minutes: q.timeLimitMinutes })
          : t('quizzes.ruleTimerNoLimit'),
        q.timeLimitMinutes ? t('quizzes.ruleNoPause') : null,
        t('quizzes.ruleAttempts', { count: q.maxAttempts }),
        q.untilDate ? t('quizzes.ruleAutoSubmit', { date: formatDateTime(q.untilDate) }) : null,
      ].filter(Boolean) as string[])
    : [];

  const pill =
    phase === 'loading' ? (
      <Badge variant="outline">—</Badge>
    ) : phase === 'unavailable' ? (
      <Badge variant="secondary" className="gap-1.5">
        <Lock className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.unavailablePill')}
      </Badge>
    ) : phase === 'closed' ? (
      <Badge variant="secondary" className="gap-1.5">
        <Lock className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.windowClosedPill')}
      </Badge>
    ) : phase === 'locked' ? (
      <Badge variant="warning" className="gap-1.5 tabular-nums">
        <Lock className="h-3.5 w-3.5" aria-hidden />{' '}
        {t('quizzes.statusOpensIn', { time: opensInShort })}
      </Badge>
    ) : (
      <Badge variant="success" className="gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.statusReady')}
      </Badge>
    );

  return (
    <Card className="overflow-hidden">
      {/* Header band: briefing kicker + one glanceable status pill */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          {t('quizzes.briefingKicker')}
        </div>
        {pill}
      </div>

      <CardContent className="space-y-6 pt-6">
        {/* Fact grid: boxed definition list, one tile per fact */}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {facts.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="rounded-md border bg-card p-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {f.label}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {f.value}
                </dd>
              </div>
            );
          })}
        </dl>

        {/* Availability timeline */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {t('quizzes.timelineHeading')}
          </div>
          {stops.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {stops.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"
                >
                  {s.done ? (
                    <CircleCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
                  )}
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatDateTime(s.iso)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {loading ? '—' : t('quizzes.timelineNoWindow')}
            </p>
          )}
        </div>

        {/* State panel: locked countdown / closed / unavailable */}
        {phase === 'locked' ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
            <div className="flex items-start gap-2">
              <Lock
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {t('quizzes.lockedTitle')}
                </p>
                <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
                  {t('quizzes.lockedBody', {
                    date: startMs !== null ? formatDateTime(q!.startTime!) : '',
                  })}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-amber-700/80 dark:text-amber-300/70">
                {t('quizzes.countdownLabel')}
              </div>
              <div className="mt-1.5 flex gap-2">
                {segments.map((seg) => (
                  <div
                    key={seg.u}
                    className="flex min-w-[3.25rem] flex-col items-center rounded-md border border-amber-300/70 bg-white/60 px-2 py-1.5 dark:border-amber-700/70 dark:bg-amber-900/30"
                  >
                    <span className="text-xl font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                      {pad(seg.v)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-300/60">
                      {seg.u}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : phase === 'closed' ? (
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium text-foreground">{t('quizzes.closedTitle')}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {endMs !== null
                    ? t('quizzes.closedBody', { date: formatDateTime(q!.endTime!) })
                    : t('quizzes.notAvailable')}
                </p>
              </div>
            </div>
          </div>
        ) : phase === 'unavailable' ? (
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium text-foreground">{t('quizzes.unavailableTitle')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('quizzes.unavailableBody')}</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Briefing: the full Markdown description, readable in every state */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {t('quizzes.briefingHeading')}
          </div>
          <div className="mt-2 max-w-2xl">
            {q?.description ? (
              <Markdown source={q.description} />
            ) : loading ? null : (
              <p className="text-sm italic text-muted-foreground">{t('quizzes.noDescription')}</p>
            )}
          </div>
        </div>

        {/* Action zone */}
        {phase === 'ready' ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {t('quizzes.groundRulesTitle')}
            </div>
            <ul className="mt-2 space-y-1.5">
              {rules.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col items-start gap-1.5">
              <Button onClick={onStart} disabled={gate.disabled || starting}>
                <Play className="h-4 w-4" aria-hidden />
                {t('quizzes.startCta')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('quizzes.startReady')}</p>
            </div>
          </div>
        ) : phase === 'locked' ? (
          <div className="flex flex-col items-start gap-1.5 border-t pt-4">
            <Button disabled title={gate.reason || undefined}>
              <Lock className="h-4 w-4" aria-hidden />
              {t('quizzes.startCta')}
            </Button>
            {gate.reason ? <p className="text-xs text-muted-foreground">{gate.reason}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
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
  // Single per-second clock for the whole page: it drives the in-progress
  // attempt timer below and the pre-start countdown / live gating above.
  const now = useNow(1000);

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

  // Mirrors the gating in StudentQuizzesPage's StartQuizBadge so the rules
  // match between the list (where users see the row action) and the detail
  // page (where they click "Start quiz" after reading the description).
  const startGate = useMemo(() => {
    const q = quiz.data;
    if (!q) return { disabled: true, reason: '' } as const;
    if (q.status !== 'published') {
      return { disabled: true, reason: t('quizzes.notAvailable') } as const;
    }
    if (q.startTime != null && now < Date.parse(q.startTime)) {
      return {
        disabled: true,
        reason: t('assignments.opensOn', { date: new Date(q.startTime).toLocaleString() }),
      } as const;
    }
    if (q.endTime != null && now >= Date.parse(q.endTime)) {
      return {
        disabled: true,
        reason: t('assignments.closesOn', { date: new Date(q.endTime).toLocaleString() }),
      } as const;
    }
    return { disabled: false, reason: '' } as const;
  }, [quiz.data, t, now]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{quiz.data?.title ?? '…'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link to={`/student/courses/${cid}/quizzes`}>← {t('common.back')}</Link>
        </Button>
      </header>

      {!attempt && !completed ? (
        <QuizPreStartCard
          quiz={quiz.data}
          now={now}
          gate={startGate}
          onStart={handleStart}
          starting={start.isPending}
        />
      ) : null}

      {!attempt && completed ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('quizzes.completedTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              {t('quizzes.totalScore')}: {completed.score ?? '—'} / {completed.maxScore ?? '—'}
            </p>
            <p>{completed.teacherReviewed ? t('quizzes.reviewed') : t('quizzes.pendingReview')}</p>
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
          <span className="text-sm">{t('quizzes.questionsCount', { count: totalQuestions })}</span>
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
                            checked={Array.isArray(value) ? value.includes(i) : value === i}
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
                        {t('quizzes.pointsAwarded')}: {ans.pointsAwarded ?? '—'} / {q.points}
                      </p>
                      {ans.feedback ? (
                        <p>
                          {t('quizzes.feedback')}: {ans.feedback}
                        </p>
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
              {submittedReview.teacherReviewed ? t('quizzes.reviewed') : t('quizzes.pendingReview')}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
