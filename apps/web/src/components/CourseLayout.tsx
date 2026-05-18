import { useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  Library,
  ListChecks,
  MessageSquare,
  Presentation,
  Settings,
  Sliders,
  UserCheck,
} from 'lucide-react';
import { useCourse } from '@/lib/queries';
import { useCourseSideNavCollapsed } from '@/components/sideNavHooks';
import type { UserRole } from '@/components/SideNav';
import { cn } from '@/lib/utils';

type CourseNavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
};

function teacherItems(courseId: string): CourseNavItem[] {
  const prefix = `/teacher/courses/${courseId}`;
  return [
    { to: `${prefix}/settings`, labelKey: 'courses.editTitle', icon: Settings },
    { to: `${prefix}/modules`, labelKey: 'modules.title', icon: Library },
    { to: `${prefix}/materials`, labelKey: 'materials.title', icon: FileText },
    { to: `${prefix}/presentations`, labelKey: 'presentations.title', icon: Presentation },
    { to: `${prefix}/assignments`, labelKey: 'assignments.title', icon: ClipboardList },
    { to: `${prefix}/discussion`, labelKey: 'discussion.title', icon: MessageSquare },
    { to: `${prefix}/quizzes`, labelKey: 'quizzes.title', icon: ListChecks },
    { to: `${prefix}/attendance`, labelKey: 'attendance.title', icon: UserCheck },
    { to: `${prefix}/gradebook`, labelKey: 'grading.gradebookTitle', icon: GraduationCap },
    { to: `${prefix}/grading-policy`, labelKey: 'grading.policyTitle', icon: Sliders },
    { to: `${prefix}/alerts`, labelKey: 'nav.alerts', icon: AlertTriangle },
  ];
}

function studentItems(courseId: string): CourseNavItem[] {
  const prefix = `/student/courses/${courseId}`;
  return [
    { to: prefix, labelKey: 'nav.overview', icon: Home, end: true },
    { to: `${prefix}/materials`, labelKey: 'materials.title', icon: FileText },
    { to: `${prefix}/presentations`, labelKey: 'presentations.title', icon: Presentation },
    { to: `${prefix}/assignments`, labelKey: 'assignments.title', icon: ClipboardList },
    { to: `${prefix}/discussion`, labelKey: 'discussion.title', icon: MessageSquare },
    { to: `${prefix}/quizzes`, labelKey: 'quizzes.title', icon: ListChecks },
    { to: `${prefix}/attendance`, labelKey: 'attendance.myTitle', icon: UserCheck },
    { to: `${prefix}/grade`, labelKey: 'nav.myGrade', icon: GraduationCap },
  ];
}

function itemsFor(role: UserRole, courseId: string): CourseNavItem[] {
  if (role === 'teacher') return teacherItems(courseId);
  if (role === 'student') return studentItems(courseId);
  return [];
}

function pickActive(items: CourseNavItem[], pathname: string): CourseNavItem | null {
  let best: CourseNavItem | null = null;
  for (const item of items) {
    const exact = pathname === item.to;
    const prefix = !item.end && (pathname === item.to || pathname.startsWith(`${item.to}/`));
    if (exact || prefix) {
      if (!best || item.to.length > best.to.length) {
        best = item;
      }
    }
  }
  return best;
}

// Mobile (<768px) uses a native top selector rather than a second drawer. The global
// nav already has a left drawer at this breakpoint; adding a second one would be
// disorienting. A top selector also avoids drowning a phone screen in 8–11 stacked
// rows of vertical course nav.
export function CourseLayout({ role }: { role: UserRole }): JSX.Element {
  const { t } = useTranslation();
  const { courseId = '' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const course = useCourse(courseId || null);
  const [collapsed, setCollapsed] = useCourseSideNavCollapsed();

  const items = useMemo(() => itemsFor(role, courseId), [role, courseId]);
  const courseTitle = course.data?.title ?? t('common.loading');
  const backTo = `/${role}/courses`;

  const activeItem = pickActive(items, location.pathname);
  const showLabels = !collapsed;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      <aside
        className={cn(
          'hidden md:sticky md:top-20 md:flex md:shrink-0 md:flex-col',
          'rounded-lg border bg-card text-card-foreground',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'md:w-14' : 'md:w-60',
        )}
        aria-label={t('nav.courseMenu')}
      >
        <div
          className={cn(
            'flex items-center gap-2 border-b px-2 py-2',
            showLabels ? 'justify-between' : 'justify-center',
          )}
        >
          {showLabels ? (
            <div className="min-w-0 flex-1 px-1">
              <Link
                to={backTo}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden />
                {t('nav.backToCourses')}
              </Link>
              <div className="mt-1 truncate text-sm font-semibold" title={courseTitle}>
                {courseTitle}
              </div>
            </div>
          ) : (
            <Link
              to={backTo}
              title={t('nav.backToCourses')}
              aria-label={t('nav.backToCourses')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t('nav.expandCourseMenu') : t('nav.collapseCourseMenu')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        <nav className="py-2" aria-label={t('nav.courseMenu')}>
          <ul className="space-y-0.5 px-2">
            {items.map((item) => (
              <li key={item.to}>
                <CourseNavLink
                  item={item}
                  showLabel={showLabels}
                  label={t(item.labelKey)}
                />
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="md:hidden">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {courseTitle}
          </span>
          <select
            value={activeItem?.to ?? ''}
            onChange={(e) => navigate(e.target.value)}
            aria-label={t('nav.courseMenu')}
            className="w-full rounded-md border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {activeItem ? null : (
              <option value="" disabled>
                {t('nav.courseMenu')}
              </option>
            )}
            {items.map((item) => (
              <option key={item.to} value={item.to}>
                {t(item.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <Link
          to={backTo}
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          {t('nav.backToCourses')}
        </Link>
      </div>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

type CourseNavLinkProps = {
  item: CourseNavItem;
  showLabel: boolean;
  label: string;
};

function CourseNavLink({ item, showLabel, label }: CourseNavLinkProps): JSX.Element {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={!showLabel ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          !showLabel && 'justify-center px-2',
        )
      }
      aria-label={!showLabel ? label : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {showLabel ? <span className="truncate">{label}</span> : null}
    </NavLink>
  );
}
