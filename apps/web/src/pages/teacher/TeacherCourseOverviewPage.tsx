import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  Library,
  ListChecks,
  MessageSquare,
  Presentation,
  Sliders,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MarkdownView } from '@/components/ui/markdown';
import { useCourse, useCourseGradingSummary } from '@/lib/queries';
import { GenerateMaterialsDialog } from '@/components/ai/GenerateMaterialsDialog';
import { GenerationHistoryCard } from '@/components/ai/GenerationHistoryCard';

type QuickLink = { to: string; labelKey: string; icon: LucideIcon };

function GradingTile({
  to,
  icon: Icon,
  count,
  label,
  isLoading,
}: {
  to: string;
  icon: LucideIcon;
  count: number;
  label: string;
  isLoading: boolean;
}): JSX.Element {
  const hasWork = count > 0;
  return (
    <Link
      to={to}
      aria-label={`${label}: ${count}`}
      className={`group flex items-center justify-between gap-3 rounded-md border bg-card px-4 py-3 transition-colors ${
        hasWork ? 'hover:border-amber-400 hover:bg-amber-50/60 dark:hover:bg-amber-950/40' : 'hover:bg-accent'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-md ${
            hasWork
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-medium leading-none">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading
              ? '—'
              : hasWork
                ? `${count} pending`
                : 'All caught up'}
          </p>
        </div>
      </div>
      <span
        className={`tabular-nums text-2xl font-semibold ${
          hasWork ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
        }`}
      >
        {isLoading ? '…' : count}
      </span>
    </Link>
  );
}

function quickLinks(prefix: string): QuickLink[] {
  return [
    { to: `${prefix}/modules`, labelKey: 'modules.title', icon: Library },
    { to: `${prefix}/materials`, labelKey: 'materials.title', icon: FileText },
    { to: `${prefix}/presentations`, labelKey: 'presentations.title', icon: Presentation },
    { to: `${prefix}/assignments`, labelKey: 'assignments.title', icon: ClipboardList },
    { to: `${prefix}/quizzes`, labelKey: 'quizzes.title', icon: ListChecks },
    { to: `${prefix}/discussion`, labelKey: 'discussion.title', icon: MessageSquare },
    { to: `${prefix}/attendance`, labelKey: 'attendance.title', icon: UserCheck },
    { to: `${prefix}/gradebook`, labelKey: 'grading.gradebookTitle', icon: GraduationCap },
    { to: `${prefix}/grading-policy`, labelKey: 'grading.policyTitle', icon: Sliders },
    { to: `${prefix}/alerts`, labelKey: 'nav.alerts', icon: AlertTriangle },
  ];
}

export function TeacherCourseOverviewPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const course = useCourse(id);
  const grading = useCourseGradingSummary(id);
  const [aiOpen, setAiOpen] = useState(false);

  if (course.isLoading) return <p>{t('common.loading')}</p>;
  if (!course.data) return <p>{t('common.error')}</p>;

  const c = course.data;
  const statusKey =
    `courses.status${c.status[0]!.toUpperCase()}${c.status.slice(1)}` as const;
  const statusVariant =
    c.status === 'active' ? 'success' : c.status === 'archived' ? 'secondary' : 'outline';

  const gradingTotal =
    (grading.data?.ungradedSubmissions ?? 0) +
    (grading.data?.ungradedQuizAnswers ?? 0) +
    (grading.data?.ungradedDiscussions ?? 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{c.title}</CardTitle>
              <CardDescription className="font-mono text-xs">
                {c.code}
                {c.termLabel ? ` · ${c.termLabel}` : ''}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant}>{t(statusKey)}</Badge>
              <Button onClick={() => setAiOpen(true)} className="gap-1.5">
                <Sparkles className="h-4 w-4" aria-hidden />
                {t('ai.generate.cta')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {c.description ? (
            <MarkdownView source={c.description} className="text-muted-foreground" />
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">
                {t('course.overview.needsGradingTitle')}
              </CardTitle>
              <CardDescription>
                {gradingTotal === 0 && !grading.isLoading
                  ? t('course.overview.needsGradingEmpty')
                  : t('course.overview.needsGradingDescription')}
              </CardDescription>
            </div>
            {gradingTotal > 0 ? (
              <Badge variant="secondary" className="gap-1">
                <span className="tabular-nums">{gradingTotal}</span>
                <span>{t('course.overview.needsGradingTotalLabel')}</span>
              </Badge>
            ) : !grading.isLoading ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/50 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {t('course.overview.needsGradingAllClear')}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3">
            <GradingTile
              to={`/teacher/courses/${id}/assignments`}
              icon={ClipboardList}
              count={grading.data?.ungradedSubmissions ?? 0}
              label={t('course.overview.needsGrading.assignments')}
              isLoading={grading.isLoading}
            />
            <GradingTile
              to={`/teacher/courses/${id}/quizzes`}
              icon={ListChecks}
              count={grading.data?.ungradedQuizAnswers ?? 0}
              label={t('course.overview.needsGrading.quizzes')}
              isLoading={grading.isLoading}
            />
            <GradingTile
              to={`/teacher/courses/${id}/discussion`}
              icon={MessageSquare}
              count={grading.data?.ungradedDiscussions ?? 0}
              label={t('course.overview.needsGrading.discussions')}
              isLoading={grading.isLoading}
            />
          </div>
        </CardContent>
      </Card>

      <GenerationHistoryCard courseId={id} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('course.overview.quickLinks')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {quickLinks(`/teacher/courses/${id}`).map((link) => {
              const Icon = link.icon;
              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{t(link.labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <GenerateMaterialsDialog
        courseId={id}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onStarted={() => setAiOpen(false)}
      />
    </div>
  );
}
