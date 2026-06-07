import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useCourseDeletionLog,
  useCoursesList,
  useCreateCourse,
  useDeletionPreview,
  useRetryR2Cleanup,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DeleteCourseDialog } from '@/components/course/DeleteCourseDialog';

type StatusFilter = 'all' | 'active' | 'archived';

export function AdminCoursesPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const courses = useCoursesList();
  const [open, setOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>(undefined);
  const preview = useDeletionPreview(selectedCourseId);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const all = useMemo(() => courses.data ?? [], [courses.data]);
  const stats = useMemo(
    () => ({
      total: all.length,
      active: all.filter((c) => c.status === 'active').length,
      archived: all.filter((c) => c.status === 'archived').length,
      students: all.reduce((sum, c) => sum + (c.counts?.students ?? 0), 0),
    }),
    [all],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.termLabel ?? '').toLowerCase().includes(q)
      );
    });
  }, [all, query, statusFilter]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('courses.filterAll') },
    { key: 'active', label: t('courses.statusActive') },
    { key: 'archived', label: t('courses.statusArchived') },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.adminCourses')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('courses.adminSubtitle')}</p>
        </div>
        <Button onClick={() => setOpen(true)}>{t('courses.newCta')}</Button>
      </header>

      {/* At-a-glance stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={BookOpen} label={t('courses.statTotal')} value={stats.total} />
        <StatCard icon={GraduationCap} label={t('courses.statusActive')} value={stats.active} />
        <StatCard icon={Archive} label={t('courses.statusArchived')} value={stats.archived} />
        <StatCard icon={Users} label={t('courses.statStudents')} value={stats.students} />
      </div>

      {courses.isLoading ? (
        <SkeletonTable />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title={t('courses.empty')}
          action={<Button onClick={() => setOpen(true)}>{t('courses.newCta')}</Button>}
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('courses.searchPlaceholder')}
                aria-label={t('courses.searchPlaceholder')}
              />
            </div>
            <div
              role="group"
              aria-label={t('courses.status')}
              className="inline-flex shrink-0 rounded-md border bg-muted p-0.5 text-sm"
            >
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={statusFilter === f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={cn(
                    'rounded px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    statusFilter === f.key
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                {t('courses.noResults')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('courses.code')}</TableHead>
                    <TableHead>{t('courses.name')}</TableHead>
                    <TableHead>{t('courses.status')}</TableHead>
                    <TableHead className="text-right">{t('courses.colStudents')}</TableHead>
                    <TableHead className="text-right">{t('courses.colModules')}</TableHead>
                    <TableHead>{t('courses.colCreated')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c.code}
                      </TableCell>
                      <TableCell className="max-w-[22rem]">
                        <Link
                          to={`/teacher/courses/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.title}
                        </Link>
                        {c.termLabel ? (
                          <div className="text-xs text-muted-foreground">{c.termLabel}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            c.status === 'active'
                              ? 'success'
                              : c.status === 'archived'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {t(`courses.status${c.status[0]!.toUpperCase()}${c.status.slice(1)}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.counts?.students ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {c.counts?.modules ?? 0}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {fmtDate(c.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm" className="gap-1">
                            <Link to={`/teacher/courses/${c.id}`}>
                              {t('common.open')}
                              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setSelectedCourseId(c.id)}
                            aria-label={`${t('common.delete')} ${c.code}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <RecentDeletionsPanel />

      <CreateCourseDialog open={open} onClose={() => setOpen(false)} />

      {preview.data ? (
        <DeleteCourseDialog
          open={!!selectedCourseId}
          onOpenChange={(o) => {
            if (!o) setSelectedCourseId(undefined);
          }}
          courseId={preview.data.courseId}
          courseCode={preview.data.courseCode}
          courseTitle={preview.data.courseTitle}
          counts={preview.data.counts}
          onDeleted={() => setSelectedCourseId(undefined)}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-semibold leading-none tabular-nums">{value}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonTable(): JSX.Element {
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
            <div className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-3.5 w-10 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentDeletionsPanel(): JSX.Element | null {
  const { t } = useTranslation();
  const deletionLog = useCourseDeletionLog();
  const retry = useRetryR2Cleanup();
  const toast = useToast();

  if (!deletionLog.data || deletionLog.data.length === 0) return null;

  const handleRetry = async (jobId: string): Promise<void> => {
    try {
      await retry.mutateAsync(jobId);
      toast.push({ title: t('admin.deletionLog.retryQueued'), tone: 'success' });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  return (
    <Card className="mt-10">
      <CardHeader>
        <CardTitle>{t('admin.deletionLog.title')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.deletionLog.colCourse')}</TableHead>
              <TableHead>{t('admin.deletionLog.colDeletedBy')}</TableHead>
              <TableHead>{t('admin.deletionLog.colWhen')}</TableHead>
              <TableHead>{t('admin.deletionLog.colCleanup')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deletionLog.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <span className="font-mono">{row.courseCode}</span>
                  <span className="text-muted-foreground"> — </span>
                  {row.courseTitle}
                </TableCell>
                <TableCell>{row.deletedByName ?? row.deletedBy ?? '—'}</TableCell>
                <TableCell>{new Date(row.deletedAt).toLocaleString()}</TableCell>
                <TableCell>
                  {row.cleanup === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : row.cleanup.status === 'done' ? (
                    <Badge variant="success">{t('admin.deletionLog.statusDone')}</Badge>
                  ) : row.cleanup.status === 'pending' ? (
                    <Badge variant="secondary">{t('admin.deletionLog.statusPending')}</Badge>
                  ) : row.cleanup.status === 'running' ? (
                    <Badge variant="outline">{t('admin.deletionLog.statusRunning')}</Badge>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Badge variant="destructive">{t('admin.deletionLog.statusFailed')}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => {
                          void handleRetry(row.cleanup!.id);
                        }}
                      >
                        {retry.isPending
                          ? t('admin.deletionLog.retrying')
                          : t('admin.deletionLog.retry')}
                      </Button>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
