import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import {
  useArchiveCourse,
  useCourse,
  useDeleteCourse,
  useUpdateCourse,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';

export function TeacherCourseSettings(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const course = useCourse(id);
  const update = useUpdateCourse();
  const archive = useArchiveCourse();
  const del = useDeleteCourse();
  const toast = useToast();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [termLabel, setTermLabel] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (course.data) {
      setTitle(course.data.title);
      setCode(course.data.code);
      setTermLabel(course.data.termLabel ?? '');
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

  const onDelete = async () => {
    if (!window.confirm(t('courses.deleteConfirm'))) return;
    try {
      // Placeholder confirmCode; Task 14 replaces this with the DeleteCourseDialog flow.
      await del.mutateAsync({ courseId: id, confirmCode: '' });
      toast.push({ title: t('courses.deleted'), tone: 'success' });
      navigate('/teacher/courses');
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  return (
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
            <div className="space-y-1">
              <Label htmlFor="term">{t('courses.term')}</Label>
              <Input id="term" value={termLabel} onChange={(e) => setTermLabel(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">{t('courses.descriptionLabel')}</Label>
            <MarkdownEditor id="description" value={description} onChange={setDescription} />
          </div>
        </CardContent>
        <CardFooter className="justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onToggleArchive} disabled={archive.isPending}>
              {course.data.status === 'active' ? t('courses.archive') : t('courses.activate')}
            </Button>
            <Button type="button" variant="destructive" onClick={onDelete} disabled={del.isPending}>
              {t('common.delete')}
            </Button>
          </div>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? t('common.loading') : t('common.save')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
