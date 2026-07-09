import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Lock, Trash2 } from 'lucide-react';
import { MODULE_CADENCES, type MeetingSlot, type ModuleCadence } from '@coursewise/shared';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { Switch } from '@/components/ui/switch';
import {
  downloadCourseExport,
  uploadFile,
  useArchiveCourse,
  useCourse,
  useCourseExports,
  useCreateCourseExport,
  useCreateExportShare,
  useDeletionPreview,
  useExportShares,
  useRevokeExportShare,
  useUpdateCourse,
} from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { DeleteCourseDialog } from '@/components/course/DeleteCourseDialog';
import { gradientFor } from '@/lib/courseGradient';

export function TeacherCourseSettings(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const course = useCourse(id);
  const update = useUpdateCourse();
  const archive = useArchiveCourse();
  const toast = useToast();
  const navigate = useNavigate();
  const { auth } = useAuth();

  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [termLabel, setTermLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [disableSubmissionsAfterEnd, setDisableSubmissionsAfterEnd] = useState(false);
  const [moduleCadence, setModuleCadence] = useState<'' | ModuleCadence>('');
  const [slots, setSlots] = useState<MeetingSlot[]>([]);
  const [description, setDescription] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const preview = useDeletionPreview(dialogOpen ? id : undefined);

  const isPrimaryTeacher = course.data?.teachers?.some(
    (teacher) => teacher.id === auth?.user.id && teacher.role === 'primary',
  );
  const canDelete = auth?.user.role === 'admin' || !!isPrimaryTeacher;

  useEffect(() => {
    if (course.data) {
      setTitle(course.data.title);
      setCode(course.data.code);
      setTermLabel(course.data.termLabel ?? '');
      // <input type="date"> wants YYYY-MM-DD; the API stores full ISO timestamps.
      setStartDate(course.data.startDate ? course.data.startDate.slice(0, 10) : '');
      setEndDate(course.data.endDate ? course.data.endDate.slice(0, 10) : '');
      setDisableSubmissionsAfterEnd(course.data.disableSubmissionsAfterEnd);
      setModuleCadence(course.data.moduleCadence ?? '');
      setSlots(course.data.meetingSlots ?? []);
      setDescription(course.data.description ?? '');
    }
  }, [course.data]);

  if (!course.data) return <p>{t('common.loading')}</p>;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id,
        input: {
          title,
          code,
          termLabel: termLabel || null,
          // Send midnight-UTC ISO so it satisfies the datetime validator; clearing
          // the field sends null.
          startDate: startDate ? `${startDate}T00:00:00.000Z` : null,
          endDate: endDate ? `${endDate}T00:00:00.000Z` : null,
          disableSubmissionsAfterEnd,
          moduleCadence: moduleCadence || null,
          meetingSlots: slots.length > 0 ? slots : null,
          description: description || null,
        },
      });
      toast.push({ title: t('courses.updated'), tone: 'success' });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  const onToggleArchive = async () => {
    const activate = course.data?.status !== 'active';
    try {
      await archive.mutateAsync({ id, activate });
      toast.push({
        title: activate ? t('courses.activated') : t('courses.archived'),
        tone: 'success',
      });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  const onPickBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.push({ title: t('courses.banner.tooLarge'), tone: 'error' });
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const { fileAssetId } = await uploadFile(file, id, 'course');
      await update.mutateAsync({ id, input: { bannerFileAssetId: fileAssetId } });
      toast.push({ title: t('courses.banner.updated'), tone: 'success' });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : null;
      toast.push({
        title: t('courses.banner.uploadFailed'),
        description: i18n ? t(i18n) : err instanceof Error ? err.message : String(err),
        tone: 'error',
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const onClearBanner = async () => {
    try {
      await update.mutateAsync({ id, input: { bannerFileAssetId: null } });
      toast.push({ title: t('courses.banner.removed'), tone: 'success' });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('courses.banner.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {course.data.bannerUrl ? (
            <img
              src={course.data.bannerUrl}
              alt=""
              className="h-40 w-full rounded-md object-cover"
            />
          ) : (
            <div
              className="h-40 w-full rounded-md"
              style={{ background: gradientFor(course.data.code) }}
              aria-hidden
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
              {uploading ? t('courses.banner.uploading') : t('courses.banner.upload')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onPickBanner}
                disabled={uploading}
              />
            </label>
            {course.data.bannerFileAssetId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearBanner}
                disabled={update.isPending}
              >
                {t('courses.banner.remove')}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t('courses.banner.hint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('courses.editTitle')}</CardTitle>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="title">{t('courses.name')}</Label>
                <Input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="code">{t('courses.code')}</Label>
                <Input id="code" required value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="term">{t('courses.term')}</Label>
                <Input id="term" value={termLabel} onChange={(e) => setTermLabel(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="startDate">{t('courses.startDate')}</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="endDate">{t('courses.endDate')}</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            {/* Lock submissions once the course end date passes. Requires an end
                date — disabled and explained otherwise. */}
            <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/20 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="lockSubmissions" className="cursor-pointer">
                  {t('courses.submissionLockLabel')}
                </Label>
                <p id="lockSubmissions-help" className="text-xs text-muted-foreground">
                  {endDate
                    ? t('courses.submissionLockHelp')
                    : t('courses.submissionLockNeedsEndDate')}
                </p>
              </div>
              <Switch
                id="lockSubmissions"
                checked={disableSubmissionsAfterEnd}
                onCheckedChange={setDisableSubmissionsAfterEnd}
                disabled={!endDate}
                aria-describedby="lockSubmissions-help"
              />
            </div>
            {/* Schedule: how often the class meets and how modules chunk. */}
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t('courses.scheduleSection')}
              </div>
              <div className="space-y-1">
                <Label htmlFor="moduleCadence">{t('courses.moduleCadenceLabel')}</Label>
                <select
                  id="moduleCadence"
                  className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={moduleCadence}
                  onChange={(e) => setModuleCadence(e.target.value as '' | ModuleCadence)}
                >
                  <option value="">{t('courses.cadence.none')}</option>
                  {MODULE_CADENCES.map((cad) => (
                    <option key={cad} value={cad}>
                      {t(`courses.cadence.${cad}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('courses.meetingTimes')}</Label>
                {slots.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={t('courses.meetingDay')}
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={s.day}
                      onChange={(e) =>
                        setSlots((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, day: Number(e.target.value) } : x)),
                        )
                      }
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                        <option key={d} value={d}>
                          {t(`courses.day.${d}`)}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="time"
                      className="w-32"
                      value={s.start}
                      onChange={(e) =>
                        setSlots((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                        )
                      }
                    />
                    <span className="text-sm text-muted-foreground">–</span>
                    <Input
                      type="time"
                      className="w-32"
                      value={s.end}
                      onChange={(e) =>
                        setSlots((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                        )
                      }
                    />
                    <ActionIconButton
                      size="sm"
                      icon={Trash2}
                      color="red"
                      label={t('courses.removeMeetingTime')}
                      onClick={() => setSlots((cur) => cur.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSlots((cur) => [...cur, { day: 1, start: '09:00', end: '10:00' }])
                  }
                >
                  {t('courses.addMeetingTime')}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">{t('courses.descriptionLabel')}</Label>
              <MarkdownEditor id="description" value={description} onChange={setDescription} />
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={onToggleArchive}
              disabled={archive.isPending}
            >
              {course.data.status === 'active' ? t('courses.archive') : t('courses.activate')}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <CourseExportSection courseId={id} />

      {/* Danger zone */}
      <section className="mt-12 rounded-md border border-red-300 bg-red-50/50 p-4">
        <h2 className="text-lg font-semibold text-red-800">{t('course.dangerZone.title')}</h2>
        <p className="mt-1 text-sm text-red-900/80">{t('course.dangerZone.description')}</p>
        <Button
          variant="destructive"
          className="mt-3"
          disabled={!canDelete}
          title={canDelete ? undefined : t('course.dangerZone.notAllowed')}
          onClick={() => setDialogOpen(true)}
        >
          {t('course.dangerZone.deleteCta')}
        </Button>
      </section>

      {preview.data ? (
        <DeleteCourseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          courseId={preview.data.courseId}
          courseCode={preview.data.courseCode}
          courseTitle={preview.data.courseTitle}
          counts={preview.data.counts}
          onDeleted={() =>
            navigate(auth?.user.role === 'admin' ? '/admin/courses' : '/teacher/courses')
          }
        />
      ) : null}
    </div>
  );
}

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function CourseExportSection({ courseId }: { courseId: string }): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const exportsQ = useCourseExports(courseId || null);
  const create = useCreateCourseExport(courseId);
  const jobs = exportsQ.data ?? [];
  const [shareJobId, setShareJobId] = useState<string | null>(null);

  const onRequest = async (): Promise<void> => {
    try {
      await create.mutateAsync();
      toast.push({ title: t('course.export.requested'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onDownload = async (jobId: string): Promise<void> => {
    try {
      await downloadCourseExport(courseId, jobId);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const statusVariant = (s: string): 'success' | 'warning' | 'destructive' | 'secondary' =>
    s === 'done' ? 'success' : s === 'failed' ? 'destructive' : 'warning';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('course.export.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('course.export.description')}</p>
        <Button onClick={onRequest} disabled={create.isPending}>
          {t('course.export.cta')}
        </Button>
        {jobs.length > 0 ? (
          <div className="space-y-2">
            {jobs.map((j) => {
              const expired = !!j.expiresAt && Date.parse(j.expiresAt) < Date.now();
              const downloadable = j.status === 'done' && !expired;
              return (
                <div
                  key={j.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Badge variant={statusVariant(j.status)}>
                    {t(`course.export.status.${j.status}`)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(j.createdAt).toLocaleString()}
                  </span>
                  {j.sizeBytes != null ? (
                    <span className="text-muted-foreground">· {formatBytes(j.sizeBytes)}</span>
                  ) : null}
                  <div className="ml-auto flex items-center gap-2">
                    {downloadable ? (
                      <>
                        {j.expiresAt ? (
                          <span className="text-xs text-muted-foreground">
                            {t('course.export.availableUntil', {
                              date: new Date(j.expiresAt).toLocaleString(),
                            })}
                          </span>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => void onDownload(j.id)}>
                          {t('course.export.download')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShareJobId(j.id)}>
                          {t('course.export.share.shareCta')}
                        </Button>
                      </>
                    ) : expired && j.status === 'done' ? (
                      <span className="text-xs text-muted-foreground">
                        {t('course.export.expired')}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
      {shareJobId ? (
        <ExportShareDialog
          courseId={courseId}
          jobId={shareJobId}
          open
          onClose={() => setShareJobId(null)}
        />
      ) : null}
    </Card>
  );
}

function ExportShareDialog({
  courseId,
  jobId,
  open,
  onClose,
}: {
  courseId: string;
  jobId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const sharesQ = useExportShares(courseId, jobId, open);
  const create = useCreateExportShare(courseId, jobId);
  const revoke = useRevokeExportShare(courseId, jobId);

  const [passphrase, setPassphrase] = useState('');
  const [ttl, setTtl] = useState('24');
  const [maxDownloads, setMaxDownloads] = useState('10');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const onCreate = async (): Promise<void> => {
    const trimmed = passphrase.trim();
    if (trimmed && trimmed.length < 8) {
      toast.push({ title: t('course.export.share.passphraseTooShort'), tone: 'error' });
      return;
    }
    try {
      const share = await create.mutateAsync({
        passphrase: trimmed ? trimmed : undefined,
        expiresInHours: Number(ttl),
        maxDownloads: Number(maxDownloads),
      });
      setCreatedUrl(share.url);
      setPassphrase('');
      toast.push({ title: t('course.export.share.created'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onCopy = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      toast.push({ title: t('course.export.share.copied'), tone: 'success' });
    } catch {
      toast.push({ title: t('course.export.share.copyFailed'), tone: 'error' });
    }
  };

  const onRevoke = async (shareId: string): Promise<void> => {
    const ok = await confirm({
      title: t('course.export.share.revokeConfirmTitle'),
      description: t('course.export.share.revokeConfirmBody'),
      confirmLabel: t('course.export.share.revoke'),
    });
    if (!ok) return;
    try {
      await revoke.mutateAsync(shareId);
      toast.push({ title: t('course.export.share.revoked'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const shares = sharesQ.data ?? [];

  return (
    <Dialog
      open={open}
      onClose={() => {
        setCreatedUrl(null);
        onClose();
      }}
      title={t('course.export.share.dialogTitle')}
    >
      <div className="space-y-4">
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {t('course.export.share.warning')}
        </div>

        {createdUrl ? (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Label>{t('course.export.share.linkReady')}</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={createdUrl}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button size="sm" variant="outline" onClick={() => void onCopy(createdUrl)}>
                <Copy className="h-4 w-4" />
                {t('course.export.share.copy')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('course.export.share.linkOnce')}</p>
            <Button size="sm" variant="ghost" onClick={() => setCreatedUrl(null)}>
              {t('course.export.share.createAnother')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="share-passphrase">{t('course.export.share.passphraseLabel')}</Label>
              <Input
                id="share-passphrase"
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={t('course.export.share.passphrasePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                {t('course.export.share.passphraseHint')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="share-ttl">{t('course.export.share.ttlLabel')}</Label>
                <select
                  id="share-ttl"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={ttl}
                  onChange={(e) => setTtl(e.target.value)}
                >
                  {['1', '6', '12', '24', '48', '72'].map((h) => (
                    <option key={h} value={h}>
                      {t('course.export.share.ttlHours', { count: Number(h) })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="share-max">{t('course.export.share.maxDownloadsLabel')}</Label>
                <Input
                  id="share-max"
                  type="number"
                  min={1}
                  max={1000}
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={() => void onCreate()} disabled={create.isPending}>
              {t('course.export.share.createCta')}
            </Button>
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t('course.export.share.activeTitle')}
          </div>
          {sharesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('course.export.share.none')}</p>
          ) : (
            <ul className="space-y-2">
              {shares.map((s) => {
                const expired = Date.parse(s.expiresAt) < Date.now();
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    {s.hasPassphrase ? (
                      <Lock
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-label={t('course.export.share.passphraseProtected')}
                      />
                    ) : null}
                    <span className="text-muted-foreground">
                      {t('course.export.share.downloadsUsed', {
                        used: s.downloadCount,
                        max: s.maxDownloads,
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ·{' '}
                      {t('course.export.share.expiresLabel', {
                        date: new Date(s.expiresAt).toLocaleString(),
                      })}
                    </span>
                    {s.locked ? (
                      <Badge variant="destructive">{t('course.export.share.locked')}</Badge>
                    ) : null}
                    {expired ? (
                      <Badge variant="secondary">{t('course.export.share.expired')}</Badge>
                    ) : null}
                    <div className="ml-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void onRevoke(s.id)}
                        disabled={revoke.isPending}
                      >
                        {t('course.export.share.revoke')}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
