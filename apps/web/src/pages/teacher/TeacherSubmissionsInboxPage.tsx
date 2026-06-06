import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Mail } from 'lucide-react';
import { MessageComposeDialog } from '@/components/messaging/MessageComposeDialog';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

function statusVariant(s: SubmissionStatus): 'success' | 'destructive' | 'secondary' {
  if (s === 'graded') return 'success';
  if (s === 'late') return 'destructive';
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

      <div className="grid items-start gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm">{t('submissions.inbox')}</CardTitle>
          </CardHeader>
          <CardContent className="p-1">
            {(isGroupMode ? grouped.isLoading : submissions.isLoading) ? (
              <p className="px-2 py-1 text-sm">{t('common.loading')}</p>
            ) : isGroupMode ? (
              !grouped.data || grouped.data.groups.length === 0 ? (
                <EmptyState title={t('submissions.empty')} />
              ) : (
                <div className="space-y-0.5">
                  {[...grouped.data.groups]
                    .sort(
                      (a, b) =>
                        submissionGradingRank(groupRepresentative(a)?.status ?? 'submitted') -
                        submissionGradingRank(groupRepresentative(b)?.status ?? 'submitted'),
                    )
                    .map((g) => {
                      const rep = groupRepresentative(g);
                      const status = rep?.status ?? 'submitted';
                      return (
                        <button
                          key={g.groupSubmissionId}
                          type="button"
                          onClick={() => openGroup(g.groupSubmissionId)}
                          className={cn(
                            'flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                            selectedGroupId === g.groupSubmissionId ? 'bg-muted' : '',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{g.groupName}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {t('submissions.memberCount', { count: g.members.length })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant={statusVariant(status)} className="shrink-0">
                              {statusLabel(t, status)}
                            </Badge>
                            <span className="font-mono text-xs text-muted-foreground">
                              {rep?.score != null ? `${rep.score} / ${maxScore ?? '—'}` : '—'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  {grouped.data.ungroupedStudents.length > 0 ? (
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
            ) : (
              <div className="space-y-0.5">
                {submissions.data.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openIndividual(s.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                      selectedId === s.id ? 'bg-muted' : '',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{s.student.name}</span>
                      <Badge variant={statusVariant(s.status)} className="shrink-0">
                        {statusLabel(t, s.status)}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {s.score != null ? `${s.score} / ${maxScore ?? '—'}` : '—'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {detailOpen ? (
          <Card className="sticky top-4 self-start">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{detailHeading}</CardTitle>
              {/* Individual mode messages the student; group mode messages the
                  member who submitted (hidden when that's unknown). */}
              {isGroupMode ? (
                groupSubmitter ? (
                  <ActionIconButton
                    icon={Mail}
                    label={t('messages.composeCta')}
                    color="sky"
                    size="sm"
                    onClick={() => setComposeOpen(true)}
                  />
                ) : null
              ) : (
                <ActionIconButton
                  icon={Mail}
                  label={t('messages.composeCta')}
                  color="sky"
                  size="sm"
                  onClick={() => setComposeOpen(true)}
                />
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>{t('submissions.textAnswer')}</Label>
                <div className="min-h-[80px] whitespace-pre-wrap rounded border bg-muted/20 p-3 text-sm">
                  {detailText ? detailText : <em>{t('submissions.noAnswer')}</em>}
                </div>
              </div>
              <div>
                <Label>{t('submissions.attachments')}</Label>
                {detailAttachments.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {detailAttachments.map((a) => (
                      <li
                        key={a.fileAssetId}
                        className="rounded border bg-background px-2.5 py-1.5 text-sm"
                      >
                        <button
                          type="button"
                          onClick={() => onDownload(a.fileAssetId)}
                          className="flex w-full min-w-0 items-center gap-2 rounded-sm text-left underline-offset-4 hover:underline"
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
                  <Label>
                    {t('submissions.memberCount', { count: selectedGroup.members.length })}
                  </Label>
                  <ul className="mt-1 space-y-1">
                    {selectedGroup.members.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5 text-sm"
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

              {detailStatus && detailStatus !== 'draft' ? (
                <>
                  {isGroupMode ? (
                    <p className="text-xs text-muted-foreground">
                      {t('submissions.groupGradeNote')}
                    </p>
                  ) : null}
                  <div>
                    <Label htmlFor="grade-score">
                      {(detailIsLate && penaltyConfigured
                        ? t('submissions.earnedScoreLabel')
                        : t('submissions.scoreLabel'))}{' '}
                      (0–{maxScore ?? '—'})
                    </Label>
                    <Input
                      id="grade-score"
                      type="number"
                      min={0}
                      max={maxScore ?? undefined}
                      step={0.5}
                      value={score}
                      onChange={(e) =>
                        setScore(e.target.value === '' ? '' : Number(e.target.value))
                      }
                    />
                  </div>
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
                  <div>
                    <Label htmlFor="grade-feedback">{t('submissions.feedbackLabel')}</Label>
                    <Textarea
                      id="grade-feedback"
                      rows={4}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onReturn}>
                      {t('submissions.returnCta')}
                    </Button>
                    <Button onClick={onGrade} disabled={score === ''}>
                      {t('submissions.gradeCta')}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t('submissions.notYetSubmitted')}</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <EmptyState title={t('submissions.selectPrompt')} />
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
          initialSubject={t('messages.aboutAssignment', {
            title: assignment.data?.title ?? '',
          })}
          contextLine={t('messages.contextAssignment', {
            title: assignment.data?.title ?? '',
          })}
        />
      ) : null}
    </div>
  );
}
