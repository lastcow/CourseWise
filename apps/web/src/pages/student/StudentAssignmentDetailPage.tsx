import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  Circle,
  CircleCheck,
  ClipboardList,
  Download,
  FileText,
  Hourglass,
  Lock,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label, Textarea } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import {
  getDownloadUrl,
  uploadFile,
  useAddSubmissionAttachment,
  useAssignment,
  useCourse,
  useMySubmission,
  useRemoveSubmissionAttachment,
  useSubmitSubmission,
  useUnsubmitSubmission,
  useUpdateSubmission,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { CourseEndedNotice } from '@/components/course/CourseEndedNotice';
import {
  UPLOAD_ACCEPT,
  isAllowedUploadFile,
  MAX_SUBMISSION_FILES,
  MAX_UPLOAD_BYTES,
  computeLatePenaltyPercent,
  courseSubmissionsClosed,
  type AssignmentSummary,
  type SubmissionStatus,
} from '@coursewise/shared';

function statusVariant(s: SubmissionStatus): 'success' | 'destructive' | 'secondary' {
  if (s === 'graded') return 'success';
  if (s === 'late' || s === 'returned') return 'destructive';
  return 'secondary';
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Pre-open "assignment briefing" — the cover sheet a student reads when an
 * assignment is published but hasn't opened yet (before startDate). Mirrors the
 * quiz pre-start briefing: the full Markdown briefing stays readable, the key
 * facts and schedule are surfaced, and an amber locked panel shows a live
 * countdown to when submissions open. The parent mounts this only while
 * `notYetOpen`, so its per-second countdown never runs once the window opens.
 */
function AssignmentBriefingCard({
  assignment: a,
  now,
  onDownload,
}: {
  assignment: AssignmentSummary;
  now: number;
  onDownload: (fileAssetId: string) => void;
}): JSX.Element {
  const { t } = useTranslation();

  const startMs = a.startDate ? Date.parse(a.startDate) : null;
  const endMs = a.endDate ? Date.parse(a.endDate) : null;
  const dueMs = a.dueDate ? Date.parse(a.dueDate) : null;
  const untilMs = a.untilDate ? Date.parse(a.untilDate) : null;

  // Live countdown to the moment the assignment opens.
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
    { v: cd.d, u: t('assignments.countdownDays') },
    { v: cd.h, u: t('assignments.countdownHours') },
    { v: cd.m, u: t('assignments.countdownMinutes') },
    { v: cd.s, u: t('assignments.countdownSeconds') },
  ];

  const isTeam = a.submissionMode === 'group';
  const facts = [
    {
      icon: Trophy,
      label: t('assignments.maxScore'),
      value: a.maxScore != null ? String(a.maxScore) : '—',
    },
    {
      icon: isTeam ? Users : User,
      label: t('assignments.metaSubmission'),
      value: isTeam ? t('assignments.submissionTeam') : t('assignments.submissionIndividual'),
    },
    {
      icon: Hourglass,
      label: t('assignments.metaLateWork'),
      value: a.allowLateSubmission
        ? t('assignments.lateAccepted')
        : t('assignments.lateNotAccepted'),
    },
  ];

  const stops = [
    a.startDate
      ? {
          label: t('assignments.timelineOpens'),
          iso: a.startDate,
          done: startMs !== null && now >= startMs,
        }
      : null,
    a.dueDate
      ? {
          label: t('assignments.timelineDue'),
          iso: a.dueDate,
          done: dueMs !== null && now >= dueMs,
        }
      : null,
    a.endDate
      ? {
          label: t('assignments.timelineCloses'),
          iso: a.endDate,
          done: endMs !== null && now >= endMs,
        }
      : null,
    a.untilDate
      ? {
          label: t('assignments.timelineSubmitBy'),
          iso: a.untilDate,
          done: untilMs !== null && now >= untilMs,
        }
      : null,
  ].filter(Boolean) as { label: string; iso: string; done: boolean }[];

  return (
    <Card className="overflow-hidden">
      {/* Header band: briefing kicker + "Opens in …" pill */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          {t('assignments.briefingKicker')}
        </div>
        <Badge variant="warning" className="gap-1.5 tabular-nums">
          <Lock className="h-3.5 w-3.5" aria-hidden />{' '}
          {t('assignments.statusOpensIn', { time: opensInShort })}
        </Badge>
      </div>

      <CardContent className="space-y-6 pt-6">
        {/* Fact grid */}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
            {t('assignments.timelineHeading')}
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
              {t('assignments.timelineNoWindow')}
            </p>
          )}
        </div>

        {/* Locked panel + live countdown to startDate */}
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
          <div className="flex items-start gap-2">
            <Lock
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-200">
                {t('assignments.lockedTitle')}
              </p>
              <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
                {t('assignments.lockedBody', {
                  date: startMs !== null ? formatDateTime(a.startDate!) : '',
                })}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-amber-700/80 dark:text-amber-300/70">
              {t('assignments.countdownLabel')}
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

        {/* Briefing: the full Markdown description + any attachment */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {t('assignments.briefingHeading')}
          </div>
          <div className="mt-2 max-w-2xl">
            {a.description ? (
              <Markdown source={a.description} />
            ) : (
              <p className="text-sm italic text-muted-foreground">
                {t('assignments.noDescription')}
              </p>
            )}
          </div>
          {a.attachmentFileId ? (
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => onDownload(a.attachmentFileId!)}>
                <Download className="h-4 w-4" aria-hidden />
                {t('assignments.downloadAttachment')}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function StudentAssignmentDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, assignmentId } = useParams();
  const cId = courseId ?? '';
  const aId = assignmentId ?? '';
  const assignment = useAssignment(aId);
  const course = useCourse(cId || null);
  const submission = useMySubmission(aId);
  const update = useUpdateSubmission(aId);
  const submit = useSubmitSubmission(aId);
  const unsubmit = useUnsubmitSubmission(aId);
  const addAttachment = useAddSubmissionAttachment(aId);
  const removeAttachment = useRemoveSubmissionAttachment(aId);
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const mySub = submission.data?.submission ?? null;
  const myGroup = submission.data?.group ?? null;
  const attachments = mySub?.attachments ?? [];

  // Seed the editor from the server once per submission. Attaching/removing a
  // file refetches my-submission; re-seeding on every refetch would clobber
  // text the student has typed but not yet saved, so we only seed when the
  // submission id changes (first load / navigation).
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (mySub && seededFor.current !== mySub.id) {
      seededFor.current = mySub.id;
      setText(mySub.textAnswer ?? '');
    }
  }, [mySub]);

  const editable = mySub?.status === 'draft' || mySub?.status === 'returned';
  const atFileLimit = attachments.length >= MAX_SUBMISSION_FILES;

  // Window gating: if the assignment hasn't opened yet, replace the details +
  // submission cards with the pre-open briefing (which counts down to the open
  // time). useNow ticks every second so the briefing's countdown stays live and
  // the page flips to the submission form the moment the start time passes.
  const now = useNow(1000);
  const startMs = assignment.data?.startDate ? Date.parse(assignment.data.startDate) : null;
  // Only a *published* assignment can be "about to open". A teacher can close or
  // archive an assignment whose startDate is still in the future; those must fall
  // through to the closed/locked handling below rather than show an "opens soon"
  // countdown for a window that will never open. Mirrors QuizPreStartCard, which
  // resolves the closed state before the locked one.
  const notYetOpen = assignment.data?.status === 'published' && startMs !== null && now < startMs;

  // A submitted (ungraded) submission can be pulled back to draft while the
  // window is still open — past end_date / until_date (or once archived) the
  // server would refuse a resubmit, so we hide the affordance too. The server
  // is authoritative; this just decides whether to show the button. When the
  // assignment allows late submission the hard window no longer closes things
  // off, so the student keeps the unsubmit/resubmit affordance past the date.
  const allowLate = assignment.data?.allowLateSubmission ?? false;
  const dueMs = assignment.data?.dueDate ? Date.parse(assignment.data.dueDate) : null;
  const endMs = assignment.data?.endDate ? Date.parse(assignment.data.endDate) : null;
  const untilMs = assignment.data?.untilDate ? Date.parse(assignment.data.untilDate) : null;
  // A course past its end date (with the lock on) is read-only for students: it
  // overrides the per-assignment late-submission allowance, so it folds into
  // windowClosed alongside the assignment's own window.
  const courseClosed = !!course.data && courseSubmissionsClosed(course.data, now);
  const windowClosed =
    courseClosed ||
    assignment.data?.status === 'archived' ||
    (!allowLate && ((endMs !== null && now >= endMs) || (untilMs !== null && now >= untilMs)));
  const canUnsubmit = (mySub?.status === 'submitted' || mySub?.status === 'late') && !windowClosed;
  // Effective deadline after which a new submission counts as late: the due
  // date, falling back to the scheduling window. Drives the late warning.
  const deadlineMs = dueMs ?? endMs ?? untilMs;
  const isLateNow =
    deadlineMs !== null && now >= deadlineMs && assignment.data?.status !== 'archived';
  // The student may edit the answer/attachments only while the row is a draft
  // AND the window is still open for them. Once closed (deadline passed with
  // late submission off, or archived) the whole section is greyed out — a
  // late-allowed assignment keeps `windowClosed` false, so it stays editable.
  const canEdit = editable && !windowClosed;
  // Late-penalty policy to surface to a student who's about to submit late, plus
  // a live estimate of what submitting *right now* would cost. Uses the shared
  // helper so the estimate matches the deduction the server actually applies.
  const penaltyPerPeriod = assignment.data?.latePenaltyPercentPerPeriod ?? null;
  const penaltyPeriodHours = assignment.data?.latePenaltyPeriodHours ?? null;
  const penaltyMaxPct = assignment.data?.latePenaltyMaxPercent ?? null;
  const penaltyConfigured = penaltyPerPeriod != null && penaltyPeriodHours != null;
  const penaltyPeriodValue =
    penaltyPeriodHours == null
      ? null
      : penaltyPeriodHours % 24 === 0
        ? penaltyPeriodHours / 24
        : penaltyPeriodHours;
  const penaltyPeriodUnitLabel = t(
    penaltyPeriodHours != null && penaltyPeriodHours % 24 === 0
      ? 'assignments.unitDays'
      : 'assignments.unitHours',
  );
  const nowPenaltyPct = penaltyConfigured
    ? computeLatePenaltyPercent({
        submittedAt: now,
        deadline: deadlineMs,
        perPeriodPercent: penaltyPerPeriod,
        periodHours: penaltyPeriodHours,
        maxPercent: penaltyMaxPct,
      })
    : 0;

  const onUpload: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !mySub) return;
    if (!isAllowedUploadFile(file.name, file.type)) {
      toast.push({ title: t('files.invalidType'), tone: 'error' });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.push({ title: t('files.tooLarge'), tone: 'error' });
      return;
    }
    if (atFileLimit) {
      toast.push({
        title: t('submissions.tooManyFiles', { max: MAX_SUBMISSION_FILES }),
        tone: 'error',
      });
      return;
    }
    try {
      setUploadProgress(0);
      const { fileAssetId } = await uploadFile(file, cId, 'submission', setUploadProgress);
      await addAttachment.mutateAsync({ id: mySub.id, fileAssetId });
      toast.push({ title: t('materials.uploadComplete'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'materials.uploadFailed';
      toast.push({ title: t(key), tone: 'error' });
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onRemoveFile = async (fileAssetId: string) => {
    if (!mySub) return;
    try {
      await removeAttachment.mutateAsync({ id: mySub.id, fileAssetId });
      toast.push({ title: t('submissions.fileRemoved'), tone: 'success' });
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    }
  };

  const onSave = async () => {
    if (!mySub) return;
    await update.mutateAsync({
      id: mySub.id,
      input: { textAnswer: text || null },
    });
    toast.push({ title: t('submissions.draftSaved'), tone: 'success' });
  };

  const onSubmit = async () => {
    if (!mySub) return;
    await onSave();
    try {
      await submit.mutateAsync(mySub.id);
      toast.push({ title: t('submissions.submitted'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onUnsubmit = async () => {
    if (!mySub) return;
    try {
      await unsubmit.mutateAsync(mySub.id);
      toast.push({ title: t('submissions.unsubmitted'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onDownload = async (id: string) => {
    try {
      const r = await getDownloadUrl(id);
      window.open(r.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">
          <Link
            to={`/student/courses/${cId}/assignments`}
            className="text-muted-foreground hover:underline"
          >
            {t('assignments.title')}
          </Link>
          {' › '}
          {assignment.data?.title ?? t('common.loading')}
        </h2>
      </header>

      <CourseEndedNotice course={course.data} />

      {assignment.data && !notYetOpen ? (
        <Card>
          <CardContent className="space-y-2 pt-4 text-sm">
            <p>
              {t('assignments.dueLabel')}:{' '}
              {assignment.data.dueDate ? new Date(assignment.data.dueDate).toLocaleString() : '—'} ·{' '}
              {t('assignments.maxScore')}: {assignment.data.maxScore ?? '—'}
            </p>
            {assignment.data.startDate || assignment.data.endDate || assignment.data.untilDate ? (
              <p className="text-xs text-muted-foreground">
                {assignment.data.startDate ? (
                  <span className="mr-3">
                    {t('assignments.opensOn', {
                      date: new Date(assignment.data.startDate).toLocaleString(),
                    })}
                  </span>
                ) : null}
                {assignment.data.endDate ? (
                  <span className="mr-3">
                    {t('assignments.closesOn', {
                      date: new Date(assignment.data.endDate).toLocaleString(),
                    })}
                  </span>
                ) : null}
                {assignment.data.untilDate ? (
                  <span>
                    {t('assignments.submitByLabel', {
                      date: new Date(assignment.data.untilDate).toLocaleString(),
                    })}
                  </span>
                ) : null}
              </p>
            ) : null}
            <Markdown source={assignment.data.description ?? ''} />
            {assignment.data.attachmentFileId ? (
              <ActionIconButton
                icon={Download}
                label={t('assignments.downloadAttachment')}
                color="sky"
                onClick={() => onDownload(assignment.data!.attachmentFileId!)}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {notYetOpen && assignment.data ? (
        <AssignmentBriefingCard assignment={assignment.data} now={now} onDownload={onDownload} />
      ) : mySub ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {myGroup ? t('submissions.teamSubmission') : t('submissions.yourSubmission')}
            </CardTitle>
            <Badge variant={statusVariant(mySub.status)}>
              {t(`submissions.status${mySub.status[0]!.toUpperCase()}${mySub.status.slice(1)}`)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {myGroup ? (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                <p className="font-medium">
                  {t('submissions.groupBannerTitle', { groupName: myGroup.groupName })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('submissions.groupBannerHelp')}
                </p>
                <p className="mt-2 text-xs">
                  <strong>{t('submissions.teamMembers')}:</strong>{' '}
                  {myGroup.members.map((m) => m.name).join(', ')}
                </p>
                {myGroup.sharedSubmittedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('submissions.lastSubmittedAt', {
                      date: new Date(myGroup.sharedSubmittedAt).toLocaleString(),
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
            {isLateNow && editable && allowLate ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {t('submissions.lateWarningTitle')}
                </p>
                <p className="mt-1 text-amber-800/90 dark:text-amber-200/80">
                  {t('submissions.lateWarningBody')}
                </p>
                {penaltyConfigured ? (
                  <p className="mt-2 font-medium text-amber-900 dark:text-amber-200">
                    {t(
                      penaltyMaxPct == null
                        ? 'assignments.latePenaltyPreviewNoMax'
                        : 'assignments.latePenaltyPreview',
                      {
                        perPeriod: penaltyPerPeriod,
                        value: penaltyPeriodValue,
                        unit: penaltyPeriodUnitLabel,
                        max: penaltyMaxPct ?? 0,
                      },
                    )}{' '}
                    {t('submissions.lateNowPenalty', { pct: nowPenaltyPct })}
                  </p>
                ) : null}
              </div>
            ) : null}
            {windowClosed && editable ? (
              // Leftover draft, but the deadline passed and late submission is
              // not allowed — explain why submit is disabled rather than
              // letting them fire a guaranteed-fail submit.
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                <p className="font-medium">{t('submissions.deadlinePassedTitle')}</p>
                <p className="mt-1 text-muted-foreground">{t('submissions.deadlinePassedBody')}</p>
              </div>
            ) : null}
            {mySub.status === 'returned' ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                <p className="font-medium">{t('submissions.returnedNotice')}</p>
                {mySub.feedback ? (
                  <p className="mt-1 whitespace-pre-wrap">{mySub.feedback}</p>
                ) : null}
              </div>
            ) : null}
            {mySub.status === 'graded' ? (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
                <p className="font-medium">
                  {t('submissions.scoreLabel')}: {mySub.score} / {assignment.data?.maxScore ?? '—'}
                  {mySub.latePenaltyPercent != null && mySub.latePenaltyPercent > 0 ? (
                    <span className="ml-2 font-normal text-destructive">
                      {t('submissions.latePenaltyBadge', { pct: mySub.latePenaltyPercent })}
                      {mySub.rawScore != null
                        ? ` (${t('submissions.latePenaltyEntered', { raw: mySub.rawScore })})`
                        : ''}
                    </span>
                  ) : null}
                </p>
                {mySub.feedback ? (
                  <p className="mt-1 whitespace-pre-wrap">{mySub.feedback}</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <Label htmlFor="ans">{t('submissions.textAnswer')}</Label>
              <Textarea
                id="ans"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>{t('submissions.attachments')}</Label>
              {attachments.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {attachments.map((a) => (
                    <li
                      key={a.fileAssetId}
                      className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => onDownload(a.fileAssetId)}
                        className="flex min-w-0 items-center gap-2 rounded-sm text-left underline-offset-4 hover:underline"
                      >
                        <Download className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                        <span className="truncate">
                          {a.filename ?? t('submissions.unnamedFile')}
                        </span>
                      </button>
                      {canEdit ? (
                        <ActionIconButton
                          icon={X}
                          label={t('common.remove')}
                          color="red"
                          size="sm"
                          onClick={() => onRemoveFile(a.fileAssetId)}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t('submissions.noFiles')}</p>
              )}
              {canEdit ? (
                <div className="mt-2 flex items-center gap-2">
                  {atFileLimit ? (
                    <p className="text-xs text-muted-foreground">
                      {t('submissions.maxFilesReached', { max: MAX_SUBMISSION_FILES })}
                    </p>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      <label>
                        {t('files.uploadFile')}
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          accept={UPLOAD_ACCEPT}
                          onChange={onUpload}
                        />
                      </label>
                    </Button>
                  )}
                  {uploadProgress != null ? (
                    <span className="text-xs">
                      {t('materials.uploading', { progress: uploadProgress })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {canEdit ? (
              <div className="flex justify-end gap-2">
                {/* Disable while a save/submit is in flight so a double-click
                    can't fire a second submit (which the server would reject
                    once the row has already flipped to submitted). */}
                <Button
                  variant="outline"
                  onClick={onSave}
                  disabled={update.isPending || submit.isPending}
                >
                  {t('submissions.saveDraft')}
                </Button>
                <Button onClick={onSubmit} disabled={update.isPending || submit.isPending}>
                  {t('submissions.submitCta')}
                </Button>
              </div>
            ) : canUnsubmit ? (
              <div className="flex flex-col items-end gap-1 border-t pt-3">
                <Button variant="outline" onClick={onUnsubmit} disabled={unsubmit.isPending}>
                  {t('submissions.unsubmitCta')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {myGroup ? t('submissions.unsubmitGroupHint') : t('submissions.unsubmitHint')}
                </p>
              </div>
            ) : windowClosed && editable ? (
              // The inline "deadline has passed" notice above already explains
              // why the section is greyed out; don't double up with the generic
              // locked line.
              <></>
            ) : (
              <p className="text-sm text-muted-foreground">{t('submissions.locked')}</p>
            )}
          </CardContent>
        </Card>
      ) : submission.error instanceof ApiClientError &&
        submission.error.error.code === 'NOT_IN_GROUP' ? (
        // Group-mode assignment + student has not joined a group in the
        // assignment's set yet. We still show the requirements above; the
        // submission card is replaced with a warning so they know what to
        // do instead of seeing a stuck loading spinner.
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t('submissions.yourSubmission')}</CardTitle>
            <Badge variant="destructive">{t('submissions.actionRequired')}</Badge>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">{t('submissions.notInGroupTitle')}</p>
              <p className="mt-1 text-muted-foreground">{t('submissions.notInGroupHelp')}</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to={`/student/courses/${cId}/students`}>
                  {t('submissions.notInGroupCta')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : submission.error instanceof ApiClientError &&
        submission.error.error.code === 'ASSIGNMENT_WINDOW_CLOSED' ? (
        // Deadline passed and late submission is not allowed, and the student
        // has no submission to show — explain why there's no form instead of
        // leaving them on a stuck spinner.
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t('submissions.yourSubmission')}</CardTitle>
            <Badge variant="destructive">{t('submissions.closedBadge')}</Badge>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">{t('submissions.deadlinePassedTitle')}</p>
              <p className="mt-1 text-muted-foreground">{t('submissions.deadlinePassedBody')}</p>
            </div>
          </CardContent>
        </Card>
      ) : submission.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : null}
    </div>
  );
}
