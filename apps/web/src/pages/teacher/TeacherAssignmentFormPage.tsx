import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { useToast } from '@/components/ui/toast';
import {
  uploadFile,
  useAssignment,
  useAssignmentGroups,
  useCreateAssignment,
  useGroupSets,
  useUpdateAssignment,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, type SubmissionMode } from '@coursewise/shared';

export function TeacherAssignmentFormPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { courseId, assignmentId } = useParams();
  const cId = courseId ?? '';
  const isNew = !assignmentId;
  const existing = useAssignment(isNew ? null : (assignmentId ?? null));
  const create = useCreateAssignment(cId);
  const update = useUpdateAssignment(cId);
  const groups = useAssignmentGroups(cId);
  const groupSets = useGroupSets(cId);
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [untilDate, setUntilDate] = useState('');
  const [maxScore, setMaxScore] = useState<number | ''>('');
  const [allowLate, setAllowLate] = useState(false);
  const [attachmentFileId, setAttachmentFileId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>('individual');
  const [groupSetId, setGroupSetId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submissions exist → freeze the mode toggle. API would reject the change
  // anyway; surfacing it in the UI saves a round-trip.
  const modeLocked = !isNew && (existing.data?.submissionCount ?? 0) > 0;

  useEffect(() => {
    if (!isNew && existing.data) {
      setTitle(existing.data.title);
      setDescription(existing.data.description ?? '');
      setDueDate(existing.data.dueDate ? new Date(existing.data.dueDate).toISOString().slice(0, 16) : '');
      setStartDate(existing.data.startDate ? new Date(existing.data.startDate).toISOString().slice(0, 16) : '');
      setEndDate(existing.data.endDate ? new Date(existing.data.endDate).toISOString().slice(0, 16) : '');
      setUntilDate(existing.data.untilDate ? new Date(existing.data.untilDate).toISOString().slice(0, 16) : '');
      setMaxScore(existing.data.maxScore ?? '');
      setAllowLate(existing.data.allowLateSubmission);
      setAttachmentFileId(existing.data.attachmentFileId);
      setGroupId(existing.data.groupId ?? null);
      setSubmissionMode(existing.data.submissionMode);
      setGroupSetId(existing.data.groupSetId ?? null);
    }
  }, [isNew, existing.data]);

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
      const { fileAssetId } = await uploadFile(file, cId, 'assignment', setUploadProgress);
      setAttachmentFileId(fileAssetId);
      toast.push({ title: t('materials.uploadComplete'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t('materials.uploadFailed'), tone: 'error' });
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (submissionMode === 'group' && !groupSetId) {
      toast.push({ title: t('assignments.groupSetRequired'), tone: 'error' });
      return;
    }
    const startIso = startDate ? new Date(startDate).toISOString() : null;
    const endIso = endDate ? new Date(endDate).toISOString() : null;
    const untilIso = untilDate ? new Date(untilDate).toISOString() : null;
    // Quick client-side guard so the user gets a friendly toast before the
    // server's same refinement rejects the request.
    const startMs = startIso ? Date.parse(startIso) : null;
    const endMs = endIso ? Date.parse(endIso) : null;
    const untilMs = untilIso ? Date.parse(untilIso) : null;
    if (
      (startMs !== null && endMs !== null && startMs > endMs) ||
      (endMs !== null && untilMs !== null && endMs > untilMs) ||
      (startMs !== null && untilMs !== null && startMs > untilMs)
    ) {
      toast.push({ title: t('assignments.schedulingOrderError'), tone: 'error' });
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      startDate: startIso,
      endDate: endIso,
      untilDate: untilIso,
      maxScore: maxScore === '' ? null : Number(maxScore),
      allowLateSubmission: allowLate,
      attachmentFileId: attachmentFileId ?? null,
      groupId,
      submissionMode,
      groupSetId: submissionMode === 'group' ? groupSetId : null,
    };
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);
        toast.push({ title: t('assignments.created'), tone: 'success' });
        navigate(`/teacher/courses/${cId}/assignments/${created.id}`);
      } else {
        await update.mutateAsync({ id: assignmentId!, input: payload });
        toast.push({ title: t('assignments.updated'), tone: 'success' });
      }
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          <Link to={`/teacher/courses/${cId}/assignments`} className="text-muted-foreground hover:underline">
            {t('assignments.title')}
          </Link>
          {' › '}
          {isNew ? t('assignments.newCta') : existing.data?.title ?? ''}
        </h2>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isNew ? t('assignments.createTitle') : t('assignments.editTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <div>
              <Label htmlFor="a-title">{t('assignments.titleLabel')}</Label>
              <Input id="a-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="a-desc">{t('assignments.descriptionLabel')}</Label>
              <MarkdownEditor id="a-desc" value={description} onChange={setDescription} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="a-due">{t('assignments.dueLabel')}</Label>
                <Input
                  id="a-due"
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="a-max">{t('assignments.maxScoreLabel')}</Label>
                <Input
                  id="a-max"
                  type="number"
                  min={0}
                  step={0.5}
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>
            <fieldset className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
              <legend className="px-1 text-sm font-medium">
                {t('assignments.schedulingLegend')}
              </legend>
              <div>
                <Label htmlFor="a-start">{t('assignments.startDateLabel')}</Label>
                <Input
                  id="a-start"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('assignments.startDateHint')}
                </p>
              </div>
              <div>
                <Label htmlFor="a-end">{t('assignments.endDateLabel')}</Label>
                <Input
                  id="a-end"
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('assignments.endDateHint')}
                </p>
              </div>
              <div>
                <Label htmlFor="a-until">{t('assignments.untilDateLabel')}</Label>
                <Input
                  id="a-until"
                  type="datetime-local"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('assignments.untilDateHint')}
                </p>
              </div>
            </fieldset>
            <div>
              <Label htmlFor="a-group">{t('assignments.groupLabel')}</Label>
              <select
                id="a-group"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={groupId ?? ''}
                onChange={(e) => setGroupId(e.target.value || null)}
                disabled={groups.isLoading}
              >
                <option value="">{t('assignments.unassignedGroup')}</option>
                {(groups.data ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">
                {t('assignments.submissionModeLabel')}
              </legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="submission-mode"
                    value="individual"
                    checked={submissionMode === 'individual'}
                    onChange={() => setSubmissionMode('individual')}
                    disabled={modeLocked}
                  />
                  {t('assignments.submissionModeIndividual')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="submission-mode"
                    value="group"
                    checked={submissionMode === 'group'}
                    onChange={() => setSubmissionMode('group')}
                    disabled={modeLocked}
                  />
                  {t('assignments.submissionModeGroup')}
                </label>
              </div>
              {modeLocked ? (
                <p className="text-xs text-muted-foreground">
                  {t('assignments.modeLockedHint')}
                </p>
              ) : null}
              {submissionMode === 'group' ? (
                <div>
                  <Label htmlFor="a-group-set">{t('assignments.groupSetLabel')}</Label>
                  <select
                    id="a-group-set"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={groupSetId ?? ''}
                    onChange={(e) => setGroupSetId(e.target.value || null)}
                    disabled={groupSets.isLoading || modeLocked}
                    required
                  >
                    <option value="">
                      {groupSets.data && groupSets.data.length === 0
                        ? t('assignments.noGroupSets')
                        : '—'}
                    </option>
                    {(groupSets.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.groupCount} × {s.maxMembersPerGroup})
                      </option>
                    ))}
                  </select>
                  {groupSets.data && groupSets.data.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('assignments.noGroupSetsHint')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
            <div className="flex items-center gap-2">
              <input
                id="a-late"
                type="checkbox"
                checked={allowLate}
                onChange={(e) => setAllowLate(e.target.checked)}
              />
              <Label htmlFor="a-late">{t('assignments.allowLate')}</Label>
            </div>
            <div>
              <Label>{t('assignments.attachment')}</Label>
              <div className="flex items-center gap-2">
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
                {attachmentFileId ? (
                  <span className="text-xs text-muted-foreground">
                    {t('assignments.attached')}: {attachmentFileId.slice(0, 8)}…
                  </span>
                ) : null}
                {uploadProgress != null ? (
                  <span className="text-xs">{t('materials.uploading', { progress: uploadProgress })}</span>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button asChild variant="outline" type="button">
                <Link to={`/teacher/courses/${cId}/assignments`}>{t('common.cancel')}</Link>
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {isNew ? t('common.create') : t('common.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
