import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Printer, FileText, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { MarkdownView } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import {
  uploadFile,
  useAssignmentGroups,
  useAssignmentsList,
  useCourse,
  useGradingPolicy,
  useModulesList,
  useQuizzesList,
  useUpdateCourse,
} from '@/lib/queries';
import { DownloadPresentationButton } from '@/components/presentation/DownloadPresentationButton';
import { gradientFor } from '@/lib/courseGradient';
import { useNow } from '@/lib/useNow';
import { ApiClientError } from '@/lib/api';

export function TeacherSyllabusPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const course = useCourse(id);
  const update = useUpdateCourse();
  const groups = useAssignmentGroups(id);
  const policy = useGradingPolicy(id);
  const modules = useModulesList(id);
  const assignments = useAssignmentsList(id);
  const quizzes = useQuizzesList(id);
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);

  function startEdit(): void {
    setDraft(course.data?.syllabusMd ?? '');
    setEditing(true);
  }

  async function onSave(): Promise<void> {
    try {
      await update.mutateAsync({
        id,
        input: { syllabusMd: draft.trim() ? draft : null },
      });
      toast.push({ title: t('syllabus.saved'), tone: 'success' });
      setEditing(false);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  }

  async function onPickPdf(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.push({ title: t('syllabus.pdf.wrongType'), tone: 'error' });
      e.target.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.push({ title: t('syllabus.pdf.tooLarge'), tone: 'error' });
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const { fileAssetId } = await uploadFile(file, id, 'course');
      await update.mutateAsync({ id, input: { syllabusFileAssetId: fileAssetId } });
      toast.push({ title: t('syllabus.pdf.uploaded'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function onRemovePdf(): Promise<void> {
    try {
      await update.mutateAsync({ id, input: { syllabusFileAssetId: null } });
      toast.push({ title: t('syllabus.pdf.removed'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  }

  // useNow re-renders every 5 minutes so the rolling 30-day window stays
  // accurate when the page is left open. Called at the top level (before
  // any early returns) per the rules of hooks.
  const now = useNow(5 * 60_000);
  const horizon = now + 30 * 24 * 60 * 60 * 1000;

  if (course.isLoading) return <p>{t('common.loading')}</p>;
  if (!course.data) return <p>{t('common.error')}</p>;
  const c = course.data;

  // Upcoming dates: assignments with dueDate AND quizzes with endTime in next 30 days.
  const upcoming: Array<{
    id: string;
    title: string;
    date: string;
    kind: 'assignment' | 'quiz';
  }> = [
    ...(assignments.data ?? [])
      .filter((a) => a.dueDate)
      .map((a) => ({
        id: a.id,
        title: a.title,
        date: a.dueDate as string,
        kind: 'assignment' as const,
      })),
    ...(quizzes.data ?? [])
      .filter((q) => q.endTime)
      .map((q) => ({
        id: q.id,
        title: q.title,
        date: q.endTime as string,
        kind: 'quiz' as const,
      })),
  ]
    .filter((x) => {
      const ts = Date.parse(x.date);
      return ts >= now && ts <= horizon;
    })
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 5);

  const attendanceWeight = policy.data?.weightAttendance ?? 0;

  return (
    <div className="space-y-4 print:m-0 print:p-0">
      <style>{`
        @media print {
          nav, aside, button { display: none !important; }
          .print-keep { display: block !important; }
          body { background: white; }
        }
      `}</style>

      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('syllabus.title')}</h2>
        <div className="flex gap-2">
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="mr-1 h-4 w-4" />
              {t('syllabus.edit')}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />
            {t('syllabus.print')}
          </Button>
        </div>
      </header>

      {/* Hero card */}
      <Card>
        <div
          className="h-32 w-full rounded-t-md"
          style={
            c.bannerUrl
              ? {
                  backgroundImage: `url(${c.bannerUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : { background: gradientFor(c.code) }
          }
          aria-hidden
        />
        <CardContent className="pt-3">
          <div className="font-mono text-sm text-muted-foreground">{c.code}</div>
          <h1 className="text-2xl font-semibold">{c.title}</h1>
          {c.termLabel ? (
            <p className="text-sm text-muted-foreground">{c.termLabel}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Authored section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('syllabus.section.overview')}</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-3">
              <MarkdownEditor
                value={draft}
                onChange={setDraft}
                placeholder={t('syllabus.editorPlaceholder')}
                minHeight={320}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  {t('syllabus.cancel')}
                </Button>
                <Button onClick={onSave} disabled={update.isPending}>
                  {t('syllabus.save')}
                </Button>
              </div>
            </div>
          ) : c.syllabusMd ? (
            <MarkdownView source={c.syllabusMd} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('syllabus.emptyTeacher')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Grading auto-section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('syllabus.section.grading')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('syllabus.section.gradingHint')}
          </p>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="py-1.5">{t('syllabus.section.attendance')}</td>
                <td className="py-1.5 text-right tabular-nums">{attendanceWeight}%</td>
              </tr>
              {(groups.data ?? []).map((g) => (
                <tr key={g.id} className="border-b">
                  <td className="py-1.5">{g.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{g.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link
            to={`/teacher/courses/${id}/grading-policy`}
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            {t('syllabus.section.viewFullPolicy')}
          </Link>
        </CardContent>
      </Card>

      {/* Schedule auto-section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('syllabus.section.schedule')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('syllabus.section.scheduleHint')}
          </p>
        </CardHeader>
        <CardContent>
          {(modules.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('syllabus.section.scheduleEmpty')}
            </p>
          ) : (
            <ul className="space-y-3">
              {(modules.data ?? []).map((m) => {
                const mAssignments = (assignments.data ?? []).filter(
                  (a) => a.moduleId === m.id,
                );
                const mQuizzes = (quizzes.data ?? []).filter((q) => q.moduleId === m.id);
                return (
                  <li key={m.id}>
                    <div className="font-medium">{m.title}</div>
                    {mAssignments.length > 0 || mQuizzes.length > 0 ? (
                      <ul className="ml-4 mt-1 text-sm text-muted-foreground">
                        {mAssignments.map((a) => (
                          <li key={a.id}>
                            {t('syllabus.assignmentLabel')}: {a.title}
                            {a.dueDate
                              ? ` — ${t('syllabus.assignmentDue', { date: new Date(a.dueDate).toLocaleDateString() })}`
                              : ''}
                          </li>
                        ))}
                        {mQuizzes.map((q) => (
                          <li key={q.id}>
                            {t('syllabus.quizLabel')}: {q.title}
                            {q.endTime
                              ? ` — ${t('syllabus.quizCloses', { date: new Date(q.endTime).toLocaleDateString() })}`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Upcoming auto-section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('syllabus.section.upcoming')}</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('syllabus.section.upcomingEmpty')}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((u) => (
                <li
                  key={`${u.kind}-${u.id}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span>
                    <span className="mr-2 text-xs uppercase text-muted-foreground">
                      {u.kind === 'assignment'
                        ? t('syllabus.assignmentLabel')
                        : t('syllabus.quizLabel')}
                    </span>
                    {u.title}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {new Date(u.date).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* PDF section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('syllabus.pdf.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {c.syllabusFileAssetId ? (
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <DownloadPresentationButton
                fileAssetId={c.syllabusFileAssetId}
                labelKey="common.download"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={onRemovePdf}
                disabled={update.isPending}
              >
                {t('syllabus.pdf.remove')}
              </Button>
            </div>
          ) : null}
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
              {uploading
                ? t('syllabus.pdf.uploading')
                : c.syllabusFileAssetId
                  ? t('syllabus.pdf.replace')
                  : t('syllabus.pdf.upload')}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={onPickPdf}
                disabled={uploading}
              />
            </label>
            <p className="mt-1 text-xs text-muted-foreground">{t('syllabus.pdf.hint')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
