import { Link } from 'react-router-dom';
import { ClipboardList, Library, Presentation, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CourseSummary } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { gradientFor } from '@/lib/courseGradient';

type Props = {
  course: CourseSummary;
  hrefBase: string; // '/teacher/courses' or '/student/courses'
};

export function CourseCard({ course, hrefBase }: Props): JSX.Element {
  const { t } = useTranslation();
  const statusKey =
    `courses.status${course.status[0]!.toUpperCase()}${course.status.slice(1)}` as const;
  const banner = course.bannerUrl ? (
    <img
      src={course.bannerUrl}
      alt={course.title}
      className="h-40 w-full object-cover"
      loading="lazy"
    />
  ) : (
    <div
      className="h-40 w-full"
      style={{ background: gradientFor(course.code) }}
      aria-hidden
    />
  );

  return (
    <Link
      to={`${hrefBase}/${course.id}`}
      className="group block overflow-hidden rounded-md border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative">
        {banner}
        <div className="absolute left-2 top-2 flex gap-1">
          <Badge
            variant={course.status === 'active' ? 'success' : 'secondary'}
            className="bg-background/80 backdrop-blur"
          >
            {t(statusKey)}
          </Badge>
          {course.lmsProvider === 'canvas' ? (
            <Badge variant="secondary" className="bg-background/80 backdrop-blur">
              {t('courses.fromCanvas')}
            </Badge>
          ) : null}
        </div>
        <div className="absolute right-2 top-2 rounded-md bg-background/80 px-2 py-0.5 font-mono text-xs backdrop-blur">
          {course.code}
        </div>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 text-base font-semibold">{course.title}</h3>
        <p className="text-xs text-muted-foreground">
          {course.code}
          {course.termLabel ? ` · ${course.termLabel}` : ''}
        </p>
        {course.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <Stat icon={Library} value={course.counts.modules} />
        <Stat icon={ClipboardList} value={course.counts.assignments} />
        <Stat icon={Presentation} value={course.counts.presentations} />
        <Stat icon={Users} value={course.counts.students} />
      </div>
    </Link>
  );
}

function Stat({ icon: Icon, value }: { icon: LucideIcon; value: number }) {
  return (
    <span className="flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="tabular-nums">{value}</span>
    </span>
  );
}
