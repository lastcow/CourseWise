import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import {
  downloadCourseExport,
  uploadFile,
  useArchiveCourse,
  useCourse,
  useCourseExports,
  useCreateCourseExport,
  useDeletionPreview,
  useUpdateCourse,
} from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
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
      toast.push({ title: activate ? t('courses.activated') : t('courses.archived'), tone: 'success' });
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
        description: i18n
          ? t(i18n)
          : err instanceof Error
            ? err.message
            : String(err),
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
                <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
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
            <div className="space-y-1">
              <Label htmlFor="description">{t('courses.descriptionLabel')}</Label>
              <MarkdownEditor id="description" value={description} onChange={setDescription} />
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button type="button" variant="outline" onClick={onToggleArchive} disabled={archive.isPending}>
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
                  <Badge variant={statusVariant(j.status)}>{t(`course.export.status.${j.status}`)}</Badge>
                  <span className="text-muted-foreground">
                    {new Date(j.createdAt).toLocaleString()}
                  </span>
                  {j.sizeBytes != null ? (
                    <span className="text-muted-foreground">· {formatBytes(j.sizeBytes)}</span>
                  ) : null}
                  <div className="ml-auto">
                    {downloadable ? (
                      <Button variant="outline" size="sm" onClick={() => void onDownload(j.id)}>
                        {t('course.export.download')}
                      </Button>
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
    </Card>
  );
}
