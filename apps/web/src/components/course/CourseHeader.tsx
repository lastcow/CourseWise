import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CourseDetail } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { gradientFor } from '@/lib/courseGradient';
import { courseTimeProgress } from '@/lib/courseProgress';
import { cn } from '@/lib/utils';

const TABS = [
  { seg: '', labelKey: 'nav.overview' },
  { seg: '/syllabus', labelKey: 'nav.syllabus' },
  { seg: '/modules', labelKey: 'modules.title' },
];

/**
 * Shared course masthead used at the top of the overview / syllabus / modules
 * pages for both roles: banner (image or procedural gradient) + status, title /
 * code / term, at-a-glance counts, the time-progress bar, an actions slot, and a
 * sub-nav tying the three "about this course" pages together.
 */
export function CourseHeader({
  course,
  role,
  actions,
}: {
  course: CourseDetail;
  role: 'teacher' | 'student';
  actions?: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const base = `/${role}/courses/${course.id}`;
  const statusKey = `courses.status${course.status[0]!.toUpperCase()}${course.status.slice(1)}`;
  const statusVariant =
    course.status === 'active' ? 'success' : course.status === 'archived' ? 'secondary' : 'outline';
  const progress = courseTimeProgress(course.startDate, course.endDate);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div
        className="relative h-24 sm:h-28"
        style={
          course.bannerUrl
            ? {
                backgroundImage: `url(${course.bannerUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: gradientFor(course.code) }
        }
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
        <Badge variant={statusVariant} className="absolute right-3 top-3">
          {t(statusKey)}
        </Badge>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">
            {course.code}
            {course.termLabel ? ` · ${course.termLabel}` : ''}
          </div>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{course.title}</h1>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t('course.header.studentsCount', { count: course.enrollmentCount })}</span>
            <span>{t('course.header.modulesCount', { count: course.counts?.modules ?? 0 })}</span>
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {progress !== null ? (
        <div className="mt-4 px-5">
          <Progress value={progress} />
        </div>
      ) : null}

      <nav className="mt-4 flex gap-1 overflow-x-auto border-t px-3 py-1.5">
        {TABS.map((tab) => {
          const to = `${base}${tab.seg}`;
          const active =
            tab.seg === ''
              ? pathname === base || pathname === `${base}/`
              : pathname.startsWith(to);
          return (
            <Link
              key={tab.seg}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
