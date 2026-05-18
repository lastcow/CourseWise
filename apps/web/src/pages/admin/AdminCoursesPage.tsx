import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCoursesList, useCreateCourse } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';

export function AdminCoursesPage(): JSX.Element {
  const { t } = useTranslation();
  const courses = useCoursesList();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('nav.adminCourses')}</h1>
        <Button onClick={() => setOpen(true)}>{t('courses.newCta')}</Button>
      </header>
      {courses.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !courses.data || courses.data.length === 0 ? (
        <EmptyState title={t('courses.empty')} action={<Button onClick={() => setOpen(true)}>{t('courses.newCta')}</Button>} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('courses.code')}</TableHead>
                  <TableHead>{t('courses.name')}</TableHead>
                  <TableHead>{t('courses.term')}</TableHead>
                  <TableHead>{t('courses.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.code}</TableCell>
                    <TableCell>
                      <Link to={`/teacher/courses/${c.id}`} className="hover:underline">
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell>{c.termLabel ?? '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.status === 'active' ? 'success' : c.status === 'archived' ? 'secondary' : 'outline'
                        }
                      >
                        {t(`courses.status${c.status[0]!.toUpperCase()}${c.status.slice(1)}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <CreateCourseDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function CreateCourseDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const create = useCreateCourse();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [termLabel, setTermLabel] = useState('');
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({ code, title, description: description || undefined, termLabel: termLabel || undefined });
      toast.push({ title: t('courses.created'), tone: 'success' });
      onClose();
      setCode('');
      setTitle('');
      setDescription('');
      setTermLabel('');
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t('courses.createTitle')}>
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="space-y-1">
          <Label htmlFor="code">{t('courses.code')}</Label>
          <Input id="code" required value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="title">{t('courses.name')}</Label>
          <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="termLabel">{t('courses.term')}</Label>
          <Input id="termLabel" value={termLabel} onChange={(e) => setTermLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="description">{t('courses.descriptionLabel')}</Label>
          <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t('common.loading') : t('common.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// Card kept for sub-section headings; export to avoid unused-import warning.
void Card;
void CardHeader;
void CardTitle;
