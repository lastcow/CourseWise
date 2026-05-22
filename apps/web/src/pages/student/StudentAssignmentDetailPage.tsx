import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
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
  useAssignment,
  useMySubmission,
  useSubmitSubmission,
  useUpdateSubmission,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, type SubmissionStatus } from '@coursewise/shared';

function statusVariant(s: SubmissionStatus): 'success' | 'destructive' | 'secondary' {
  if (s === 'graded') return 'success';
  if (s === 'late' || s === 'returned') return 'destructive';
  return 'secondary';
}

export function StudentAssignmentDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, assignmentId } = useParams();
  const cId = courseId ?? '';
  const aId = assignmentId ?? '';
  const assignment = useAssignment(aId);
  const submission = useMySubmission(aId);
  const update = useUpdateSubmission(aId);
  const submit = useSubmitSubmission(aId);
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileAssetId, setFileAssetId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const mySub = submission.data?.submission ?? null;
  const myGroup = submission.data?.group ?? null;

  useEffect(() => {
    if (mySub) {
      setText(mySub.textAnswer ?? '');
      setFileAssetId(mySub.fileAssetId);
    }
  }, [mySub]);

  const editable = mySub?.status === 'draft' || mySub?.status === 'returned';

  const onUpload: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
      toast.push({ title: t('files.invalidType'), tone: 'error' });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.push({ title: t('files.tooLarge'), tone: 'error' });
      return;
    }
    try {
      setUploadProgress(0);
      const { fileAssetId: newId } = await uploadFile(file, cId, 'submission', setUploadProgress);
      setFileAssetId(newId);
      toast.push({ title: t('materials.uploadComplete'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t('materials.uploadFailed'), tone: 'error' });
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onSave = async () => {
    if (!mySub) return;
    await update.mutateAsync({
      id: mySub.id,
      input: { textAnswer: text || null, fileAssetId: fileAssetId ?? null },
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
          <Link to={`/student/courses/${cId}/assignments`} className="text-muted-foreground hover:underline">
            {t('assignments.title')}
          </Link>
          {' › '}
          {assignment.data?.title ?? t('common.loading')}
        </h2>
      </header>

      {assignment.data ? (
        <Card>
          <CardContent className="space-y-2 pt-4 text-sm">
            <p>
              {t('assignments.dueLabel')}:{' '}
              {assignment.data.dueDate
                ? new Date(assignment.data.dueDate).toLocaleString()
                : '—'}{' '}
              · {t('assignments.maxScore')}: {assignment.data.maxScore ?? '—'}
            </p>
            {assignment.data.startDate ||
            assignment.data.endDate ||
            assignment.data.untilDate ? (
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

      {mySub ? (
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
                  {t('submissions.scoreLabel')}: {mySub.score} /{' '}
                  {assignment.data?.maxScore ?? '—'}
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
                disabled={!editable}
              />
            </div>
            <div>
              <Label>{t('submissions.attachment')}</Label>
              <div className="flex items-center gap-2">
                {editable ? (
                  <Button asChild variant="outline" size="sm">
                    <label>
                      {t('files.uploadFile')}
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept={ALLOWED_UPLOAD_MIME_TYPES.join(',')}
                        onChange={onUpload}
                      />
                    </label>
                  </Button>
                ) : null}
                {fileAssetId ? (
                  <ActionIconButton
                    icon={Download}
                    label={t('materials.download')}
                    color="sky"
                    onClick={() => onDownload(fileAssetId)}
                  />
                ) : null}
                {uploadProgress != null ? (
                  <span className="text-xs">{t('materials.uploading', { progress: uploadProgress })}</span>
                ) : null}
              </div>
            </div>
            {editable ? (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onSave}>
                  {t('submissions.saveDraft')}
                </Button>
                <Button onClick={onSubmit}>{t('submissions.submitCta')}</Button>
              </div>
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
              <p className="mt-1 text-muted-foreground">
                {t('submissions.notInGroupHelp')}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to={`/student/courses/${cId}/students`}>
                  {t('submissions.notInGroupCta')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p>{t('common.loading')}</p>
      )}
    </div>
  );
}
