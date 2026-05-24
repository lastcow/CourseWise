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
import type { SubmissionStatus } from '@coursewise/shared';

function statusVariant(s: SubmissionStatus): 'success' | 'destructive' | 'secondary' {
  if (s === 'graded') return 'success';
  if (s === 'late') return 'destructive';
  return 'secondary';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [score, setScore] = useState<number | ''>('');
  const [feedback, setFeedback] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);

  // Flatten member rows so the existing selected-row UI keeps working in
  // both individual and group modes.
  const flatRows = isGroupMode
    ? (grouped.data?.groups ?? []).flatMap((g) => g.members)
    : submissions.data ?? [];
  const selected = flatRows.find((s) => s.id === selectedId) ?? null;

  const openSelected = (id: string) => {
    const s = flatRows.find((x) => x.id === id);
    setSelectedId(id);
    if (s) {
      setScore(s.score ?? '');
      setFeedback(s.feedback ?? '');
    }
  };

  const onDownload = async (fileId: string) => {
    try {
      const r = await getDownloadUrl(fileId);
      window.open(r.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    }
  };

  const onGrade = async () => {
    if (!selectedId || score === '') return;
    try {
      await grade.mutateAsync({
        id: selectedId,
        input: { score: Number(score), feedback: feedback || null },
      });
      toast.push({ title: t('submissions.graded'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onReturn = async () => {
    if (!selectedId) return;
    await returnSub.mutateAsync({
      id: selectedId,
      input: { feedback: feedback || null },
    });
    toast.push({ title: t('submissions.returned'), tone: 'success' });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          <Link to={`/teacher/courses/${cId}/assignments`} className="text-muted-foreground hover:underline">
            {t('assignments.title')}
          </Link>
          {' › '}
          {assignment.data?.title ?? t('common.loading')}
          {' › '}
          {t('submissions.title')}
        </h2>
      </header>

      <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
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
                <div className="space-y-2">
                  {grouped.data.groups.map((g) => (
                    <div key={g.groupSubmissionId} className="rounded border">
                      <div className="border-b bg-muted/30 px-2 py-1 text-xs font-medium">
                        {g.groupName}
                        {g.sharedSubmittedAt ? (
                          <span className="ml-1 text-muted-foreground">
                            · {t('submissions.submittedShort')}
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-0.5 p-1">
                        {g.members.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => openSelected(s.id)}
                            className={cn(
                              'flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                              selectedId === s.id ? 'bg-muted' : '',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-medium">{s.student.name}</span>
                              <Badge variant={statusVariant(s.status)} className="shrink-0">
                                {t(`submissions.status${s.status[0]!.toUpperCase()}${s.status.slice(1)}`)}
                              </Badge>
                            </div>
                            <p className="font-mono text-xs text-muted-foreground">
                              {s.score != null
                                ? `${s.score} / ${assignment.data?.maxScore ?? '—'}`
                                : '—'}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {grouped.data.ungroupedStudents.length > 0 ? (
                    <div className="rounded border border-dashed p-2 text-xs text-muted-foreground">
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
                    onClick={() => openSelected(s.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                      selectedId === s.id ? 'bg-muted' : '',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{s.student.name}</span>
                      <Badge variant={statusVariant(s.status)} className="shrink-0">
                        {t(`submissions.status${s.status[0]!.toUpperCase()}${s.status.slice(1)}`)}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {s.score != null
                        ? `${s.score} / ${assignment.data?.maxScore ?? '—'}`
                        : '—'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{selected.student.name}</CardTitle>
              <ActionIconButton
                icon={Mail}
                label={t('messages.composeCta')}
                color="sky"
                size="sm"
                onClick={() => setComposeOpen(true)}
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>{t('submissions.textAnswer')}</Label>
                <div className="min-h-[80px] whitespace-pre-wrap rounded border bg-muted/20 p-3 text-sm">
                  {selected.textAnswer ?? <em>{t('submissions.noAnswer')}</em>}
                </div>
              </div>
              {selected.fileAssetId ? (
                <div className="flex items-center gap-2">
                  <Label className="m-0">{t('submissions.attachment')}</Label>
                  <ActionIconButton
                    icon={Download}
                    label={t('materials.download')}
                    color="sky"
                    onClick={() => onDownload(selected.fileAssetId!)}
                  />
                </div>
              ) : null}
              {selected.status !== 'draft' ? (
                <>
                  <div>
                    <Label htmlFor="grade-score">
                      {t('submissions.scoreLabel')} (0–{assignment.data?.maxScore ?? '—'})
                    </Label>
                    <Input
                      id="grade-score"
                      type="number"
                      min={0}
                      max={assignment.data?.maxScore ?? undefined}
                      step={0.5}
                      value={score}
                      onChange={(e) => setScore(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
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

      {composeOpen && selected ? (
        <MessageComposeDialog
          open
          onClose={() => setComposeOpen(false)}
          courseId={cId}
          recipientId={selected.student.id}
          recipientName={selected.student.name}
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
