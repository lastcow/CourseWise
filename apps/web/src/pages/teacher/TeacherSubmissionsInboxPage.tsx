import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Download,
  Mail,
  Paperclip,
  Percent,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { MessageComposeDialog } from '@/components/messaging/MessageComposeDialog';
import { AssignmentRequirementDialog } from '@/components/assignments/AssignmentRequirementDialog';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import {
  getDownloadUrl,
  useAssignment,
  useAssignmentSubmissions,
  useAssignmentSubmissionsByGroup,
  useGradeSubmission,
  useReturnSubmission,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/lib/api';
import { computeLatePenaltyPercent, submissionGradingRank } from '@coursewise/shared';
import type {
  GroupSubmissionWithMembers,
  SubmissionStatus,
  SubmissionWithStudent,
} from '@coursewise/shared';

const needsGrading = (s: SubmissionStatus): boolean => s === 'submitted' || s === 'late';

function statusVariant(s: SubmissionStatus): 'success' | 'destructive' | 'secondary' | 'warning' {
  if (s === 'graded') return 'success';
  if (s === 'late') return 'warning';
  if (s === 'submitted') return 'warning';
  return 'secondary';
}

function statusLabel(t: (k: string) => string, s: SubmissionStatus): string {
  return t(`submissions.status${s[0]!.toUpperCase()}${s.slice(1)}`);
}

// A group is graded as a unit, so any submitted member row carries the
// canonical score/feedback/status; we surface that representative member for
// the inbox summary and pre-fill, and grade through its id (the API fans the
// grade out to every teammate).
function groupRepresentative(g: GroupSubmissionWithMembers): SubmissionWithStudent | null {
  return g.members.find((m) => m.status !== 'draft') ?? g.members[0] ?? null;
}

export function TeacherSubmissionsInboxPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, assignmentId } = useParams();
  const cId = courseId ?? '';
  const aId = assignmentId ?? '';
  const assignment = useAssignment(aId);
  const isGroupMode = assignment.data?.submissionMode === 'group';
  const submissions = useAssignmentSubmissions(isGroupMode ? null : aId);
  const grouped = useAssignmentSubmissionsByGroup(isGroupMode ? aId : null);
  const grade = useGradeSubmission(aId);
  const returnSub = useReturnSubmission(aId);
  const toast = useToast();
  const maxScore = assignment.data?.maxScore ?? null;

  // Individual mode selects a submission row; group mode selects a whole group
  // (by its shared group_submissions id) since the team shares one grade.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [score, setScore] = useState<number | ''>('');
  const [feedback, setFeedback] = useState('');
  const [waiveLate, setWaiveLate] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');

  const selectedIndividual = !isGroupMode
    ? ((submissions.data ?? []).find((s) => s.id === selectedId) ?? null)
    : null;
  const selectedGroup = isGroupMode
    ? ((grouped.data?.groups ?? []).find((g) => g.groupSubmissionId === selectedGroupId) ?? null)
    : null;
  const groupRep = selectedGroup ? groupRepresentative(selectedGroup) : null;
  // The member who actually submitted is the natural messaging recipient for a
  // group; if we can't identify them we hide the compose action.
  const groupSubmitter = selectedGroup
    ? (selectedGroup.members.find((m) => m.student.id === selectedGroup.sharedSubmittedById) ??
      null)
    : null;

  const openIndividual = (id: string) => {
    const s = (submissions.data ?? []).find((x) => x.id === id);
    setSelectedId(id);
    // Pre-fill the *earned* (pre-penalty) score so re-grading doesn't compound
    // the deduction; fall back to the stored score for never-late work.
    setScore(s?.rawScore ?? s?.score ?? '');
    setFeedback(s?.feedback ?? '');
    setWaiveLate(s?.latePenaltyWaived ?? false);
  };

  const openGroup = (groupSubmissionId: string) => {
    const g = (grouped.data?.groups ?? []).find((x) => x.groupSubmissionId === groupSubmissionId);
    setSelectedGroupId(groupSubmissionId);
    const rep = g ? groupRepresentative(g) : null;
    setScore(rep?.rawScore ?? rep?.score ?? '');
    setFeedback(rep?.feedback ?? '');
    setWaiveLate(rep?.latePenaltyWaived ?? false);
  };

  const onDownload = async (fileId: string) => {
    try {
      const r = await getDownloadUrl(fileId);
      window.open(r.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    }
  };

  // The id we grade/return through: a group's representative member (the API
  // propagates to the rest) or the selected individual row.
  const targetSubmissionId = isGroupMode ? (groupRep?.id ?? null) : selectedId;

  const onGrade = async () => {
    if (!targetSubmissionId || score === '') return;
    try {
      await grade.mutateAsync({
        id: targetSubmissionId,
        input: { score: Number(score), feedback: feedback || null, waiveLatePenalty: waiveLate },
      });
      toast.push({ title: t('submissions.graded'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onReturn = async () => {
    if (!targetSubmissionId) return;
    await returnSub.mutateAsync({
      id: targetSubmissionId,
      input: { feedback: feedback || null },
    });
    toast.push({ title: t('submissions.returned'), tone: 'success' });
  };

  const detailHeading = isGroupMode ? selectedGroup?.groupName : selectedIndividual?.student.name;
  const detailStatus = isGroupMode ? groupRep?.status : selectedIndividual?.status;
  const detailText = isGroupMode ? selectedGroup?.sharedContent : selectedIndividual?.textAnswer;
  const detailAttachments = isGroupMode
    ? (selectedGroup?.attachments ?? [])
    : (selectedIndividual?.attachments ?? []);
  const detailOpen = isGroupMode ? !!selectedGroup : !!selectedIndividual;

  // Late-penalty breakdown for the currently selected submission.
  const detailSub = isGroupMode ? groupRep : selectedIndividual;
  const ad = assignment.data;
  const penaltyConfigured =
    ad?.latePenaltyPercentPerPeriod != null && ad?.latePenaltyPeriodHours != null;
  const detailIsLate = detailSub?.status === 'late';
  const effectiveDeadline = ad ? (ad.dueDate ?? ad.endDate ?? ad.untilDate) : null;
  const livePenaltyPct =
    detailIsLate && penaltyConfigured && !waiveLate
      ? computeLatePenaltyPercent({
          submittedAt: detailSub?.submittedAt ?? null,
          deadline: effectiveDeadline,
          perPeriodPercent: ad?.latePenaltyPercentPerPeriod ?? null,
          periodHours: ad?.latePenaltyPeriodHours ?? null,
          maxPercent: ad?.latePenaltyMaxPercent ?? null,
        })
      : 0;
  const lateDays =
    detailSub?.submittedAt && effectiveDeadline
      ? Math.max(
          1,
          Math.ceil(
            (new Date(detailSub.submittedAt).getTime() - new Date(effectiveDeadline).getTime()) /
              86_400_000,
          ),
        )
      : 0;
  const liveFinal =
    score === ''
      ? null
      : Math.max(
          0,
          Math.min(
            maxScore ?? Number.POSITIVE_INFINITY,
            Number(score) * (1 - livePenaltyPct / 100),
          ),
        );

  // Roster summary counts (whichever mode is active).
  const rosterStatuses: SubmissionStatus[] = isGroupMode
    ? (grouped.data?.groups ?? []).map((g) => groupRepresentative(g)?.status ?? 'submitted')
    : (submissions.data ?? []).map((s) => s.status);
  const rosterCount = rosterStatuses.length;
  const toGradeCount = rosterStatuses.filter(needsGrading).length;

  // Stored grade for the hero (final, post-penalty).
  const storedScore = detailSub?.score ?? null;
  const heroPct =
    storedScore !== null && maxScore && maxScore > 0 ? (storedScore / maxScore) * 100 : null;

  // Inbox search: filter the roster by student name / email (group mode also
  // matches the group name and any member).
  const rq = rosterSearch.trim().toLowerCase();
  const matchesPerson = (name: string, email: string): boolean =>
    !rq || `${name} ${email}`.toLowerCase().includes(rq);
  const filteredSubs = (submissions.data ?? []).filter((s) =>
    matchesPerson(s.student.name, s.student.email),
  );
  const filteredGroups = (grouped.data?.groups ?? []).filter(
    (g) =>
      !rq ||
      g.groupName.toLowerCase().includes(rq) ||
      g.members.some((m) => matchesPerson(m.student.name, m.student.email)),
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          <Link
            to={`/teacher/courses/${cId}/assignments`}
            className="text-muted-foreground hover:underline"
          >
            {t('assignments.title')}
          </Link>
          {' › '}
          {assignment.data?.title ?? t('common.loading')}
          {' › '}
          {t('submissions.title')}
        </h2>
      </header>

      {/* Read-only assignment requirements, opened in a dialog — sits above the
          inbox so a teacher can re-read what was asked before grading. */}
      {assignment.data ? (
        <button
          type="button"
          onClick={() => setReqOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium shadow-sm transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('submissions.viewRequirements')}
        </button>
      ) : null}

      <div className="grid items-start gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* Roster */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t('submissions.inbox')}
            </span>
            {toGradeCount > 0 ? (
              <Badge variant="warning">
                {t('submissions.toGradeCount', { count: toGradeCount })}
              </Badge>
            ) : rosterCount > 0 ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> {t('submissions.allGraded')}
              </Badge>
            ) : null}
          </div>
          <div className="border-b bg-muted/30 px-2 pb-2">
            <Input
              type="search"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder={t('submissions.searchPlaceholder')}
              className="h-8"
            />
          </div>
          <CardContent className="p-1">
            {(isGroupMode ? grouped.isLoading : submissions.isLoading) ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : isGroupMode ? (
              !grouped.data || grouped.data.groups.length === 0 ? (
                <EmptyState title={t('submissions.empty')} />
              ) : filteredGroups.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t('submissions.noSearchMatch')}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {[...filteredGroups]
                    .sort(
                      (a, b) =>
                        submissionGradingRank(groupRepresentative(a)?.status ?? 'submitted') -
                        submissionGradingRank(groupRepresentative(b)?.status ?? 'submitted'),
                    )
                    .map((g) => {
                      const rep = groupRepresentative(g);
                      const status = rep?.status ?? 'submitted';
                      return (
                        <RosterRow
                          key={g.groupSubmissionId}
                          title={g.groupName}
                          subtitle={t('submissions.memberCount', { count: g.members.length })}
                          status={status}
                          score={rep?.score ?? null}
                          maxScore={maxScore}
                          selected={selectedGroupId === g.groupSubmissionId}
                          onClick={() => openGroup(g.groupSubmissionId)}
                        />
                      );
                    })}
                  {!rq && grouped.data.ungroupedStudents.length > 0 ? (
                    <div className="mt-2 rounded border border-dashed p-2 text-xs text-muted-foreground">
                      <p className="font-medium">{t('submissions.notSubmittedYet')}</p>
                      <p className="mt-1">
                        {grouped.data.ungroupedStudents.map((u) => u.name).join(', ')}
                      </p>
                    </div>
                  ) : null}
                </div>
              )
            ) : !submissions.data || submissions.data.length === 0 ? (
              <EmptyState title={t('submissions.empty')} />
            ) : filteredSubs.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t('submissions.noSearchMatch')}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredSubs.map((s) => (
                  <RosterRow
                    key={s.id}
                    title={s.student.name}
                    status={s.status}
                    score={s.score ?? null}
                    maxScore={maxScore}
                    selected={selectedId === s.id}
                    onClick={() => openIndividual(s.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail */}
        {!detailOpen ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={<ClipboardCheck className="h-6 w-6" />}
                title={t('submissions.title')}
                description={t('submissions.selectPrompt')}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="sticky top-4 self-start overflow-hidden">
            {/* Header band */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                  {t('submissions.gradingKicker')}
                </div>
                <p className="mt-0.5 truncate text-lg font-semibold">{detailHeading}</p>
              </div>
              <div className="flex items-center gap-2">
                {detailStatus ? (
                  needsGrading(detailStatus) ? (
                    <Badge variant="warning" className="gap-1.5">
                      <Clock className="h-3.5 w-3.5" aria-hidden /> {t('submissions.needsGrading')}
                    </Badge>
                  ) : detailStatus === 'graded' ? (
                    <Badge variant="success" className="gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{' '}
                      {t('submissions.statusGraded')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{statusLabel(t, detailStatus)}</Badge>
                  )
                ) : null}
                {(isGroupMode ? groupSubmitter : selectedIndividual) ? (
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
              {detailStatus && detailStatus !== 'draft' ? (
                <>
                  {/* Score hero */}
                  <div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-semibold tabular-nums">
                        {storedScore ?? '—'}
                        <span className="text-2xl text-muted-foreground"> / {maxScore ?? '—'}</span>
                      </span>
                      {heroPct !== null ? (
                        <span className="text-lg font-medium tabular-nums text-muted-foreground">
                          {heroPct.toFixed(0)}%
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          storedScore === null ? 'bg-amber-400' : 'bg-emerald-500',
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, heroPct ?? 0))}%` }}
                      />
                    </div>
                    {storedScore === null ? (
                      <p className="mt-2 text-sm text-amber-700">
                        {t('submissions.awaitingGrade')}
                      </p>
                    ) : null}
                  </div>

                  {/* Fact tiles */}
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Fact
                      icon={Percent}
                      label={t('submissions.tilePercent')}
                      value={heroPct !== null ? `${heroPct.toFixed(0)}%` : '—'}
                    />
                    <Fact
                      icon={CalendarClock}
                      label={t('submissions.tileSubmitted')}
                      className="sm:col-span-2"
                      value={
                        detailSub?.submittedAt ? formatSubmittedAt(detailSub.submittedAt) : '—'
                      }
                    />
                    <Fact
                      icon={Paperclip}
                      label={t('submissions.tileFiles')}
                      value={String(detailAttachments.length)}
                    />
                    {isGroupMode && selectedGroup ? (
                      <Fact
                        icon={Users}
                        label={t('submissions.tileMembers')}
                        value={String(selectedGroup.members.length)}
                      />
                    ) : (
                      <Fact
                        icon={Clock}
                        label={t('submissions.tileLate')}
                        value={
                          detailIsLate
                            ? waiveLate
                              ? t('submissions.penaltyWaived')
                              : `−${livePenaltyPct}%`
                            : t('submissions.tileOnTime')
                        }
                      />
                    )}
                  </dl>
                </>
              ) : null}

              {/* Submission content */}
              <div>
                <Label className="text-muted-foreground">{t('submissions.textAnswer')}</Label>
                <div className="mt-1 min-h-[80px] whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                  {detailText ? (
                    detailText
                  ) : (
                    <span className="italic text-muted-foreground">{t('submissions.noAnswer')}</span>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">{t('submissions.attachments')}</Label>
                {detailAttachments.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {detailAttachments.map((a) => (
                      <li key={a.fileAssetId}>
                        <button
                          type="button"
                          onClick={() => onDownload(a.fileAssetId)}
                          className="flex w-full min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-sm underline-offset-4 hover:bg-muted hover:underline"
                        >
                          <Download className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                          <span className="truncate">
                            {a.filename ?? t('submissions.unnamedFile')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{t('submissions.noFiles')}</p>
                )}
              </div>

              {isGroupMode && selectedGroup ? (
                <div>
                  <Label className="text-muted-foreground">
                    {t('submissions.memberCount', { count: selectedGroup.members.length })}
                  </Label>
                  <ul className="mt-1 space-y-1">
                    {selectedGroup.members.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm"
                      >
                        <span className="truncate">{m.student.name}</span>
                        <Badge variant={statusVariant(m.status)} className="shrink-0">
                          {statusLabel(t, m.status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>

            {/* Grading controls (footer) */}
            {detailStatus && detailStatus !== 'draft' ? (
              <CardFooter className="flex-col items-stretch gap-3 border-t bg-muted/20 pt-4">
                {isGroupMode ? (
                  <p className="text-xs text-muted-foreground">{t('submissions.groupGradeNote')}</p>
                ) : null}

                {/* Late-penalty context */}
                {detailIsLate ? (
                  <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
                    <p className="text-amber-900 dark:text-amber-200">
                      {penaltyConfigured
                        ? t('submissions.gradeLateNote', {
                            days: t('submissions.lateDaysCount', { count: lateDays }),
                            pct: waiveLate ? 0 : livePenaltyPct,
                            final: liveFinal == null ? '—' : Math.round(liveFinal * 100) / 100,
                            max: maxScore ?? '—',
                          })
                        : t('submissions.gradeLateNoneNote')}
                    </p>
                    {penaltyConfigured ? (
                      <label className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                        <input
                          type="checkbox"
                          checked={waiveLate}
                          onChange={(e) => setWaiveLate(e.target.checked)}
                        />
                        {t('submissions.waiveLatePenalty')}
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {/* Feedback — full width */}
                <div>
                  <Label htmlFor="grade-feedback">{t('submissions.feedbackLabel')}</Label>
                  <Textarea
                    id="grade-feedback"
                    rows={4}
                    className="w-full"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                </div>

                {/* Score + actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="grade-score" className="shrink-0">
                    {detailIsLate && penaltyConfigured
                      ? t('submissions.earnedScoreLabel')
                      : t('submissions.scoreLabel')}
                  </Label>
                  <Input
                    id="grade-score"
                    type="number"
                    min={0}
                    max={maxScore ?? undefined}
                    step={0.5}
                    className="w-24"
                    value={score}
                    onChange={(e) => setScore(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  <span className="text-sm text-muted-foreground">/ {maxScore ?? '—'}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onReturn}>
                      {t('submissions.returnCta')}
                    </Button>
                    <Button size="sm" onClick={onGrade} disabled={score === ''}>
                      {t('submissions.gradeCta')}
                    </Button>
                  </div>
                </div>
              </CardFooter>
            ) : (
              <CardFooter className="border-t pt-4">
                <p className="text-sm text-muted-foreground">{t('submissions.notYetSubmitted')}</p>
              </CardFooter>
            )}
          </Card>
        )}
      </div>

      {composeOpen && (isGroupMode ? groupSubmitter : selectedIndividual) ? (
        <MessageComposeDialog
          open
          onClose={() => setComposeOpen(false)}
          courseId={cId}
          recipientId={isGroupMode ? groupSubmitter!.student.id : selectedIndividual!.student.id}
          recipientName={
            isGroupMode ? groupSubmitter!.student.name : selectedIndividual!.student.name
          }
          initialSubject={t('messages.aboutAssignment', { title: assignment.data?.title ?? '' })}
          contextLine={t('messages.contextAssignment', { title: assignment.data?.title ?? '' })}
        />
      ) : null}

      {assignment.data ? (
        <AssignmentRequirementDialog
          assignment={assignment.data}
          open={reqOpen}
          onClose={() => setReqOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RosterRow({
  title,
  subtitle,
  status,
  score,
  maxScore,
  selected,
  onClick,
}: {
  title: string;
  subtitle?: string;
  status: SubmissionStatus;
  score: number | null;
  maxScore: number | null;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const ng = needsGrading(status);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-1 rounded-md border-l-2 px-2.5 py-2 text-left text-sm hover:bg-muted',
        selected ? 'bg-muted' : '',
        ng ? 'border-l-amber-400' : 'border-l-transparent',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{title}</span>
        <Badge variant={statusVariant(status)} className="shrink-0">
          {statusLabel(t, status)}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
        <span>
          {score != null ? `${score} / ${maxScore ?? '—'}` : '—'}
        </span>
        {subtitle ? <span className="font-sans">{subtitle}</span> : null}
      </div>
    </button>
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
