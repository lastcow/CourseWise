import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { useCreateCourse } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';

export function TeacherNewCoursePage(): JSX.Element {
  const { t } = useTranslation();
  const create = useCreateCourse();
  const toast = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [termLabel, setTermLabel] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await create.mutateAsync({
        code,
        title,
        description: description || undefined,
        termLabel: termLabel || undefined,
      });
      toast.push({ title: t('courses.created'), tone: 'success' });
      navigate(`/teacher/courses/${created.id}`);
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t('courses.createTitle')}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t('courses.name')}</CardTitle>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="code">{t('courses.code')}</Label>
              <Input id="code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="MGMT102" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="title">{t('courses.name')}</Label>
              <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="termLabel">{t('courses.term')}</Label>
              <Input id="termLabel" value={termLabel} onChange={(e) => setTermLabel(e.target.value)} placeholder="2026-Spring" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">{t('courses.descriptionLabel')}</Label>
              <MarkdownEditor id="description" value={description} onChange={setDescription} />
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button type="button" variant="outline" asChild>
              <Link to="/teacher/courses">{t('common.cancel')}</Link>
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('common.loading') : t('common.create')}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
