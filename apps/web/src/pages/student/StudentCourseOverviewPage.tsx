import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  FileText,
  GraduationCap,
  Library,
  ListChecks,
  MessageSquare,
  Presentation,
  UserCheck,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MarkdownView } from '@/components/ui/markdown';
import { AttendanceSignInDialog } from '@/components/AttendanceSignInDialog';
import { courseTimeProgress } from '@/lib/courseProgress';
import {
  useAssignmentsList,
  useCourse,
  useDiscussionTopicsList,
  useMaterialsList,
  useModulesList,
  usePresentationsList,
  useQuizzesList,
  useTodayAttendanceSession,
} from '@/lib/queries';

function dismissKey(sessionId: string): string {
  return `attendance-dismissed:${sessionId}`;
}

type QuickLink = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  count: number | null;
  isLoading: boolean;
};

export function StudentCourseOverviewPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const course = useCourse(id);
  const modulesQ = useModulesList(id);
  const materialsQ = useMaterialsList(id);
  const presentationsQ = usePresentationsList(id);
  const assignmentsQ = useAssignmentsList(id);
  const quizzesQ = useQuizzesList(id);
  const discussionsQ = useDiscussionTopicsList(id);
  const todayQ = useTodayAttendanceSession(id);
  const [signOpen, setSignOpen] = useState(false);

  useEffect(() => {
    const today = todayQ.data;
    if (!today) return;
    // Don't nag before the self-sign window opens — students would otherwise see
    // a "not open yet" popup on every visit until a few minutes before start.
    if (today.windowState === 'early') return;
    try {
      if (sessionStorage.getItem(dismissKey(today.session.id)) === '1') return;
    } catch {
      // sessionStorage unavailable (private mode, etc.) — fall through and open.
    }
    setSignOpen(true);
  }, [todayQ.data]);

  const onCloseSign = (): void => {
    setSignOpen(false);
    const today = todayQ.data;
    if (!today) return;
    try {
      sessionStorage.setItem(dismissKey(today.session.id), '1');
    } catch {
      // best-effort
    }
  };

  if (course.isLoading) return <p>{t('common.loading')}</p>;
  if (!course.data) return <p>{t('common.error')}</p>;

  const c = course.data;

  // Time-based course progress: how far today sits between the course's start
  // and end dates. Null (bar hidden) when the course has no schedule set.
  const progressPct = courseTimeProgress(c.startDate, c.endDate);

  const statusKey =
    `courses.status${c.status[0]!.toUpperCase()}${c.status.slice(1)}` as const;
  const statusVariant =
    c.status === 'active' ? 'success' : c.status === 'archived' ? 'secondary' : 'outline';

  // Cards mirror the teacher overview's quickLinks shape so the two
  // pages read as the same screen with role-specific destinations.
  // Each card carries an optional count — only the listable categories
  // (materials, assignments, etc.) get a number; "My grade" and the
  // attendance link don't have a meaningful collection count.
  const cards: QuickLink[] = [
    {
      to: `/student/courses/${id}/modules`,
      labelKey: 'modules.title',
      icon: Library,
      count: modulesQ.data?.length ?? null,
      isLoading: modulesQ.isLoading,
    },
    {
      to: `/student/courses/${id}/materials`,
      labelKey: 'materials.title',
      icon: FileText,
      count: materialsQ.data?.length ?? null,
      isLoading: materialsQ.isLoading,
    },
    {
      to: `/student/courses/${id}/presentations`,
      labelKey: 'presentations.title',
      icon: Presentation,
      count: presentationsQ.data?.length ?? null,
      isLoading: presentationsQ.isLoading,
    },
    {
      to: `/student/courses/${id}/assignments`,
      labelKey: 'assignments.title',
      icon: ClipboardList,
      count: assignmentsQ.data?.length ?? null,
      isLoading: assignmentsQ.isLoading,
    },
    {
      to: `/student/courses/${id}/quizzes`,
      labelKey: 'quizzes.title',
      icon: ListChecks,
      count: quizzesQ.data?.length ?? null,
      isLoading: quizzesQ.isLoading,
    },
    {
      to: `/student/courses/${id}/discussion`,
      labelKey: 'discussion.title',
      icon: MessageSquare,
      count: discussionsQ.data?.length ?? null,
      isLoading: discussionsQ.isLoading,
    },
    {
      to: `/student/courses/${id}/attendance`,
      labelKey: 'attendance.myTitle',
      icon: UserCheck,
      count: null,
      isLoading: false,
    },
    {
      to: `/student/courses/${id}/students`,
      labelKey: 'students.title',
      icon: Users,
      count: null,
      isLoading: false,
    },
    {
      to: `/student/courses/${id}/grade`,
      labelKey: 'nav.myGrade',
      icon: GraduationCap,
      count: null,
      isLoading: false,
    },
  ];

  return (
    <div className="space-y-4">
      {todayQ.data ? (
        <AttendanceSignInDialog
          open={signOpen}
          onClose={onCloseSign}
          courseId={id}
          session={todayQ.data.session}
          alreadySigned={todayQ.data.alreadySigned}
          windowState={todayQ.data.windowState}
          minutesSinceStart={todayQ.data.minutesSinceStart}
        />
      ) : null}

      <Card className="overflow-hidden">
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
        {progressPct !== null ? (
          <Progress
            value={progressPct}
            className="rounded-none"
            barClassName="rounded-none"
          />
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('course.overview.quickLinks')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {cards.map((link) => {
              const Icon = link.icon;
              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1 truncate">{t(link.labelKey)}</span>
                    {link.count != null ? (
                      // Same mini outlined-badge style as the module
                      // accordion-header count chips, so the visual
                      // language is consistent.
                      <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-sm border border-input px-1.5 text-xs font-medium leading-tight tabular-nums text-foreground">
                        {link.isLoading ? '…' : link.count}
                      </span>
                    ) : null}
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
