import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Award,
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleCheck,
  Clock,
  FileText,
  ListChecks,
  Lock,
  Percent,
  Play,
  Repeat,
  ShieldCheck,
  Target,
  Trophy,
  XCircle,
} from 'lucide-react';
import type {
  QuizAttemptDetail,
  QuizAttemptSummary,
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
  useQuizAttempt,
  useStartQuizAttempt,
  useSubmitQuizAttempt,
} from '@/lib/queries';
import { apiCall, pickI18nKey } from '@/lib/api';
import { cn } from '@/lib/utils';
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
  // When the quiz has tester schedules, this student's wave window overrides the
  // quiz defaults; `blocked` means they're enrolled but scheduled for no wave.
  const ms = q?.mySchedule ?? null;
  const blocked = ms?.blocked === true;
  const useWave = !!ms && !ms.blocked;
  const effStart = useWave ? ms!.startTime : (q?.startTime ?? null);
  const effEnd = useWave ? ms!.endTime : (q?.endTime ?? null);
  const effUntil = useWave ? ms!.untilDate : (q?.untilDate ?? null);
  const effTimeLimit = useWave ? ms!.timeLimitMinutes : (q?.timeLimitMinutes ?? null);
  const effMaxAttempts = useWave ? ms!.maxAttempts : (q?.maxAttempts ?? null);
  const waveName = useWave ? ms!.name : null;

  const startMs = effStart ? Date.parse(effStart) : null;
  const endMs = effEnd ? Date.parse(effEnd) : null;
  const untilMs = effUntil ? Date.parse(effUntil) : null;

  const notYetOpen = startMs !== null && now < startMs;
  const windowClosed = endMs !== null && now >= endMs;

  // Mutually-exclusive presentation state. Reserve `unavailable` for an
  // unpublished draft; `blocked` for a gated quiz the student isn't scheduled
  // for; an explicitly closed/archived quiz (or one past its window) reads as
  // the calmer `closed`, never "Unavailable".
  type Phase = 'loading' | 'unavailable' | 'blocked' | 'closed' | 'locked' | 'ready';
  const phase: Phase = !q
    ? 'loading'
    : q.status === 'draft'
      ? 'unavailable'
      : blocked
        ? 'blocked'
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
      value: effTimeLimit
        ? t('quizzes.metaMinutes', { minutes: effTimeLimit })
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
      value: q ? String(effMaxAttempts ?? q.maxAttempts) : '—',
    },
  ];

  // Availability stops (this student's effective window), past ones marked done.
  const stops = [
    effStart
      ? {
          label: t('quizzes.timelineOpens'),
          iso: effStart,
          done: startMs !== null && now >= startMs,
        }
      : null,
    effEnd
      ? { label: t('quizzes.timelineCloses'), iso: effEnd, done: endMs !== null && now >= endMs }
      : null,
    effUntil
      ? {
          label: t('quizzes.timelineSubmitBy'),
          iso: effUntil,
          done: untilMs !== null && now >= untilMs,
        }
      : null,
  ].filter(Boolean) as { label: string; iso: string; done: boolean }[];

  // Ground rules shown in the `ready` state so starting feels deliberate.
  const rules = q
    ? ([
        effTimeLimit
          ? t('quizzes.ruleTimer', { minutes: effTimeLimit })
          : t('quizzes.ruleTimerNoLimit'),
        effTimeLimit ? t('quizzes.ruleNoPause') : null,
        t('quizzes.ruleAttempts', { count: effMaxAttempts ?? q.maxAttempts }),
        effUntil ? t('quizzes.ruleAutoSubmit', { date: formatDateTime(effUntil) }) : null,
      ].filter(Boolean) as string[])
    : [];

  const pill =
    phase === 'loading' ? (
      <Badge variant="outline">—</Badge>
    ) : phase === 'unavailable' ? (
      <Badge variant="secondary" className="gap-1.5">
        <Lock className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.unavailablePill')}
      </Badge>
    ) : phase === 'blocked' ? (
      <Badge variant="secondary" className="gap-1.5">
        <Lock className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.schedules.notScheduledPill')}
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
        {waveName ? (
          <p className="text-sm text-muted-foreground">
            {t('quizzes.schedules.yourWave', { name: waveName })}
          </p>
        ) : null}
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
                    date: startMs !== null && effStart ? formatDateTime(effStart) : '',
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
                  {endMs !== null && effEnd
                    ? t('quizzes.closedBody', { date: formatDateTime(effEnd) })
                    : t('quizzes.notAvailable')}
                </p>
              </div>
            </div>
          </div>
        ) : phase === 'blocked' ? (
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium text-foreground">
                  {t('quizzes.schedules.notScheduledTitle')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('quizzes.schedules.notScheduledBody')}
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

// ---------------------------------------------------------------------------
// Post-completion "results" surface. Mirrors the QuizPreStartCard briefing's
// visual language (header band + kicker + status pill + boxed fact tiles) so a
// student who just finished — or revisits — sees a professional summary instead
// of a bare "score / max" line. Latest attempt shows by default; a dropdown
// switches between attempts when more than one exists.
// ---------------------------------------------------------------------------

function attemptTime(a: { submittedAt: string | null; startedAt: string }): number {
  return Date.parse(a.submittedAt ?? a.startedAt);
}

function QuizResultCard({
  detail,
  quiz,
  attempts,
  selectedId,
  onSelect,
}: {
  detail: QuizAttemptDetail;
  quiz: QuizSummary | undefined;
  // Latest-first list of this student's completed attempts (for the picker).
  attempts: QuizAttemptSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}): JSX.Element {
  const { t } = useTranslation();

  const score = detail.score;
  const maxScore = detail.maxScore ?? quiz?.maxScore ?? null;
  const pct =
    score !== null && maxScore !== null && maxScore > 0 ? (score / maxScore) * 100 : null;
  const passing = quiz?.passingScore ?? null;
  const pending = detail.pendingReviewCount > 0;
  const passed = !pending && passing !== null && score !== null && score >= passing;
  const failed = !pending && passing !== null && score !== null && score < passing;

  // Chronological numbering: oldest attempt is #1.
  const oldestFirst = [...attempts].sort((a, b) => attemptTime(a) - attemptTime(b));
  const ordinalOf = (id: string) => oldestFirst.findIndex((a) => a.id === id) + 1;

  const pill = pending ? (
    <Badge variant="warning" className="gap-1.5">
      <Clock className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.pendingReview')}
    </Badge>
  ) : passed ? (
    <Badge variant="success" className="gap-1.5">
      <Award className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.passed')}
    </Badge>
  ) : failed ? (
    <Badge variant="destructive" className="gap-1.5">
      <XCircle className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.notPassed')}
    </Badge>
  ) : (
    <Badge variant="success" className="gap-1.5">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {t('quizzes.reviewed')}
    </Badge>
  );

  const facts = [
    {
      icon: Percent,
      label: t('quizzes.resultPercent'),
      value: pct !== null ? `${pct.toFixed(0)}%` : '—',
    },
    {
      icon: Target,
      label: t('quizzes.metaPassing'),
      value: passing != null ? String(passing) : '—',
    },
    {
      icon: ListChecks,
      label: t('quizzes.metaQuestions'),
      value: quiz?.questionCount != null ? String(quiz.questionCount) : String(detail.questions.length),
    },
    {
      icon: Repeat,
      label: t('quizzes.metaAttempts'),
      value: quiz ? `${ordinalOf(selectedId) || 1} / ${quiz.maxAttempts}` : '—',
    },
    {
      icon: CalendarClock,
      label: t('quizzes.resultSubmitted'),
      value: detail.submittedAt ? formatDateTime(detail.submittedAt) : '—',
    },
  ];

  return (
    <Card className="overflow-hidden">
      {/* Header band: results kicker + status pill */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Trophy className="h-3.5 w-3.5" aria-hidden />
          {t('quizzes.resultsKicker')}
        </div>
        {pill}
      </div>

      <CardContent className="space-y-6 pt-6">
        {/* Attempt picker — only when there's more than one completed attempt */}
        {attempts.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="attempt-picker" className="text-sm text-muted-foreground">
              {t('quizzes.viewingAttempt')}
            </Label>
            <select
              id="attempt-picker"
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={selectedId}
              onChange={(e) => onSelect(e.target.value)}
            >
              {attempts.map((a) => (
                <option key={a.id} value={a.id}>
                  {t('quizzes.attemptOption', {
                    n: ordinalOf(a.id),
                    score: a.score ?? '—',
                    max: a.maxScore ?? maxScore ?? '—',
                    date: a.submittedAt ? formatDateTime(a.submittedAt) : '—',
                  })}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Score hero + progress */}
        <div>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-semibold tabular-nums">
              {score ?? '—'}
              <span className="text-2xl text-muted-foreground"> / {maxScore ?? '—'}</span>
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
                pending ? 'bg-amber-400' : failed ? 'bg-red-500' : 'bg-emerald-500',
              )}
              style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }}
            />
          </div>
          {pending ? (
            <p className="mt-2 text-sm text-amber-700">{t('quizzes.resultPendingHint')}</p>
          ) : null}
        </div>

        {/* Fact grid — same boxed tiles as the briefing */}
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
      </CardContent>
    </Card>
  );
}

// Read-only per-question review: the student's submitted answer plus
// correctness, points awarded, and any teacher feedback.
function QuizAnswerReview({ detail }: { detail: QuizAttemptDetail }): JSX.Element {
  const { t } = useTranslation();
  const answerByQ = new Map(detail.answers.map((a) => [a.questionId, a]));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" aria-hidden />
        {t('quizzes.reviewHeading')}
      </div>
      {detail.questions.map((q: Question, idx) => {
        const ans = answerByQ.get(q.id);
        const pending = ans ? ans.pointsAwarded === null : true;
        const correct = ans?.isCorrect === true;
        const incorrect = ans?.isCorrect === false;
        const Icon = pending ? Clock : correct ? CheckCircle2 : incorrect ? XCircle : CheckCircle2;
        const iconClass = pending
          ? 'text-amber-500'
          : incorrect
            ? 'text-red-500'
            : 'text-emerald-500';
        return (
          <Card key={q.id}>
            <CardContent className="space-y-2 pt-4">
              <div className="flex items-start gap-2">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 tabular-nums font-medium">{idx + 1}.</span>
                    <Markdown source={q.prompt} className="leading-relaxed" />
                  </div>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                  {ans?.pointsAwarded ?? '—'} / {q.points}
                </span>
              </div>

              <div className="ml-6 text-sm">
                <span className="text-muted-foreground">{t('quizzes.yourAnswer')}: </span>
                <StudentAnswer question={q} answer={ans?.answer} />
              </div>

              {ans?.feedback ? (
                <div className="ml-6 rounded-md border bg-muted/50 p-2 text-sm">
                  <span className="text-muted-foreground">{t('quizzes.feedback')}: </span>
                  {ans.feedback}
                </div>
              ) : null}
              {pending ? (
                <p className="ml-6 text-xs text-amber-700">{t('quizzes.pendingReview')}</p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Render a student's stored answer read-only, by question type.
function StudentAnswer({
  question: q,
  answer,
}: {
  question: Question;
  answer: unknown;
}): JSX.Element {
  const { t } = useTranslation();
  if (answer === undefined || answer === null || answer === '') {
    return <span className="italic text-muted-foreground">{t('quizzes.noAnswer')}</span>;
  }
  if (q.type === 'true_false') {
    return <span className="font-medium">{answer ? t('quizzes.true') : t('quizzes.false')}</span>;
  }
  if ((q.type === 'single_choice' || q.type === 'multiple_choice') && q.options) {
    const idxs = Array.isArray(answer)
      ? (answer as number[])
      : typeof answer === 'number'
        ? [answer]
        : [];
    const chosen = idxs.map((i) => q.options?.[i]).filter((x): x is string => x != null);
    return (
      <span className="font-medium">
        {chosen.length > 0 ? chosen.join(', ') : t('quizzes.noAnswer')}
      </span>
    );
  }
  // short_answer / case_analysis — free text (markdown).
  if (typeof answer === 'string') {
    return (
      <div className="mt-1 rounded-md border bg-background p-2">
        <Markdown source={answer} className="leading-relaxed" />
      </div>
    );
  }
  return <span className="font-medium">{String(answer)}</span>;
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
  // A quiz that hasn't opened yet (locked), is still a draft, or is loading
  // can't have a *current* attempt — any submitted/expired row is stale (a prior
  // window or a reset). In those states the pre-start briefing must win, so the
  // student isn't bounced to an old "Your attempt" result for a quiz they can't
  // even start yet. For an open/closed quiz a completed attempt still shows its
  // result as before.
  // Honour this student's wave window (and a "not scheduled" block) so the
  // briefing wins over a stale attempt whenever they can't start right now.
  const mySched = quiz.data?.mySchedule ?? null;
  const effStartIso =
    mySched && !mySched.blocked ? mySched.startTime : (quiz.data?.startTime ?? null);
  const startMs = effStartIso ? Date.parse(effStartIso) : null;
  const notYetAttemptable =
    !quiz.data ||
    quiz.data.status === 'draft' ||
    mySched?.blocked === true ||
    (startMs !== null && now < startMs);
  const showResult = !attempt && !!completed && !notYetAttemptable;
  const showBriefing = !attempt && !showResult;
  const totalQuestions = attempt?.questions.length ?? 0;

  // ----- Completed-quiz results: latest attempt by default, dropdown for more -----
  const justSubmitted = attempt && attempt.status !== 'in_progress' ? attempt : null;
  const completedAttempts = useMemo<QuizAttemptSummary[]>(() => {
    const list = (attemptsList.data ?? []).filter(
      (a) => a.status === 'submitted' || a.status === 'expired',
    );
    // Fold in the just-submitted attempt in case the list hasn't refetched yet.
    if (justSubmitted && !list.some((a) => a.id === justSubmitted.id)) {
      list.push(justSubmitted);
    }
    return [...list].sort((a, b) => attemptTime(b) - attemptTime(a));
  }, [attemptsList.data, justSubmitted]);

  const isResults = showResult || !!justSubmitted;
  const defaultAttemptId = justSubmitted?.id ?? completedAttempts[0]?.id ?? null;
  const [pickedAttemptId, setPickedAttemptId] = useState<string | null>(null);
  // Snap the picker back to the freshly submitted attempt whenever one lands.
  useEffect(() => {
    if (justSubmitted) setPickedAttemptId(justSubmitted.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justSubmitted?.id]);
  const effectiveAttemptId = pickedAttemptId ?? defaultAttemptId;
  // Fetch detail unless the selected attempt is the in-memory just-submitted one.
  const needsFetch = !!effectiveAttemptId && effectiveAttemptId !== justSubmitted?.id;
  const fetchedAttempt = useQuizAttempt(needsFetch ? effectiveAttemptId : null);
  const resultDetail: QuizAttemptDetail | null =
    justSubmitted && effectiveAttemptId === justSubmitted.id
      ? justSubmitted
      : (fetchedAttempt.data ?? null);

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

  // Mirrors the gating in StudentQuizzesPage's StartQuizBadge so the rules
  // match between the list (where users see the row action) and the detail
  // page (where they click "Start quiz" after reading the description).
  const startGate = useMemo(() => {
    const q = quiz.data;
    if (!q) return { disabled: true, reason: '' } as const;
    if (q.status !== 'published') {
      return { disabled: true, reason: t('quizzes.notAvailable') } as const;
    }
    const sched = q.mySchedule ?? null;
    if (sched?.blocked) {
      return { disabled: true, reason: t('quizzes.schedules.notScheduledPill') } as const;
    }
    // A wave's window overrides the quiz defaults for this student.
    const eStart = sched && !sched.blocked ? sched.startTime : q.startTime;
    const eEnd = sched && !sched.blocked ? sched.endTime : q.endTime;
    if (eStart != null && now < Date.parse(eStart)) {
      return {
        disabled: true,
        reason: t('assignments.opensOn', { date: new Date(eStart).toLocaleString() }),
      } as const;
    }
    if (eEnd != null && now >= Date.parse(eEnd)) {
      return {
        disabled: true,
        reason: t('assignments.closesOn', { date: new Date(eEnd).toLocaleString() }),
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

      {showBriefing ? (
        <QuizPreStartCard
          quiz={quiz.data}
          now={now}
          gate={startGate}
          onStart={handleStart}
          starting={start.isPending}
        />
      ) : null}

      {isResults ? (
        resultDetail && effectiveAttemptId ? (
          <>
            <QuizResultCard
              detail={resultDetail}
              quiz={quiz.data}
              attempts={completedAttempts}
              selectedId={effectiveAttemptId}
              onSelect={setPickedAttemptId}
            />
            <QuizAnswerReview detail={resultDetail} />
          </>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        )
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

      {attempt && inProgress
        ? attempt.questions.map((q: Question, idx) => {
            const value = answers[q.id];
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
    </div>
  );
}
