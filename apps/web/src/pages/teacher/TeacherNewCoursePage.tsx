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
      if (
        err instanceof ApiClientError &&
        err.error.code === 'VALIDATION_ERROR' &&
        err.error.details?.[0]
      ) {
        const detail = err.error.details[0];
        const field = String(detail.path[0] ?? '');
        // Prefer a field-specific hint; fall back to the generic zod-code
        // copy ("Invalid string", "Too short", etc.).
        toast.push({
          title: t('errors.validation'),
          description: t(`courses.${field}Hint`, {
            defaultValue: t(`errors.field.${detail.code}`, {
              defaultValue: t('errors.field.custom'),
            }),
          }),
          tone: 'error',
        });
        return;
      }
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
              <Input
                id="code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="MGMT102"
                pattern="[A-Za-z0-9_-]{2,32}"
                minLength={2}
                maxLength={32}
                title={t('courses.codeHint')}
              />
              <p className="text-xs text-muted-foreground">{t('courses.codeHint')}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="title">{t('courses.name')}</Label>
              <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="termLabel">{t('courses.term')}</Label>
              <Input
                id="termLabel"
                value={termLabel}
                onChange={(e) => setTermLabel(e.target.value)}
                placeholder="2026-Spring"
              />
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
