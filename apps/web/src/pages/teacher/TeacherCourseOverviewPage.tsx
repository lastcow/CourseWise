import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ClipboardList,
  FileText,
  GraduationCap,
  Library,
  ListChecks,
  MessageSquare,
  Presentation,
  Sliders,
  UserCheck,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MarkdownView } from '@/components/ui/markdown';
import { useCourse } from '@/lib/queries';

type QuickLink = { to: string; labelKey: string; icon: LucideIcon };

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

  if (course.isLoading) return <p>{t('common.loading')}</p>;
  if (!course.data) return <p>{t('common.error')}</p>;

  const c = course.data;
  const statusKey =
    `courses.status${c.status[0]!.toUpperCase()}${c.status.slice(1)}` as const;
  const statusVariant =
    c.status === 'active' ? 'success' : c.status === 'archived' ? 'secondary' : 'outline';

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
            <Badge variant={statusVariant}>{t(statusKey)}</Badge>
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
    </div>
  );
}
