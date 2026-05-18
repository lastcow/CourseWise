import { useMemo } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  LayoutDashboard,
  Library,
  ListChecks,
  MessageSquare,
  Presentation,
  Settings,
  Sliders,
  Ticket,
  UserCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type UserRole = 'admin' | 'teacher' | 'student';

type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
};

type NavGroup = {
  id: string;
  titleKey?: string;
  items: NavItem[];
};

const ADMIN_GROUPS: NavGroup[] = [
  {
    id: 'admin',
    items: [
      { to: '/admin/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { to: '/admin/courses', labelKey: 'nav.adminCourses', icon: BookOpen },
      { to: '/admin/alerts', labelKey: 'nav.alerts', icon: AlertTriangle },
      { to: '/admin/invitation-codes', labelKey: 'nav.invitationCodes', icon: Ticket },
    ],
  },
];

const TEACHER_TOP_GROUPS: NavGroup[] = [
  {
    id: 'teacher',
    items: [{ to: '/teacher/courses', labelKey: 'nav.courses', icon: BookOpen, end: false }],
  },
];

const STUDENT_TOP_GROUPS: NavGroup[] = [
  {
    id: 'student',
    items: [
      { to: '/student/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { to: '/student/courses', labelKey: 'nav.courses', icon: BookOpen, end: false },
    ],
  },
];

function teacherCourseChildItems(courseId: string): NavItem[] {
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

function studentCourseChildItems(courseId: string): NavItem[] {
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

type SideNavProps = {
  role: UserRole;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
  onClose?: () => void;
};

export function SideNav({
  role,
  collapsed,
  onToggleCollapsed,
  variant = 'desktop',
  onNavigate,
  onClose,
}: SideNavProps): JSX.Element {
  const { t } = useTranslation();
  const teacherCourseMatch = useMatch('/teacher/courses/:courseId/*');
  const teacherCourseId = teacherCourseMatch?.params.courseId;
  const studentCourseMatch = useMatch('/student/courses/:courseId/*');
  const studentCourseId = studentCourseMatch?.params.courseId;
  const isMobile = variant === 'mobile';
  // In mobile drawer, force expanded for readability
  const showLabels = isMobile ? true : !collapsed;

  const groups = useMemo<NavGroup[]>(() => {
    if (role === 'admin') return ADMIN_GROUPS;
    if (role === 'teacher') {
      const top = TEACHER_TOP_GROUPS;
      if (teacherCourseId && teacherCourseId !== 'new') {
        return [
          ...top,
          {
            id: 'currentCourse',
            titleKey: 'nav.currentCourse',
            items: teacherCourseChildItems(teacherCourseId),
          },
        ];
      }
      return top;
    }
    if (role === 'student') {
      const top = STUDENT_TOP_GROUPS;
      if (studentCourseId) {
        return [
          ...top,
          {
            id: 'currentCourse',
            titleKey: 'nav.currentCourse',
            items: studentCourseChildItems(studentCourseId),
          },
        ];
      }
      return top;
    }
    return [];
  }, [role, teacherCourseId, studentCourseId]);

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col bg-card text-card-foreground',
        isMobile && 'w-72',
      )}
      aria-label={t('nav.sideMenu')}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b px-3',
          showLabels ? 'justify-between' : 'justify-center',
        )}
      >
        {showLabels ? (
          <span className="text-sm font-semibold">{t('app.name')}</span>
        ) : null}
        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label={t('nav.sideMenu')}>
        {groups.map((group) => (
          <div key={group.id} className="mb-2">
            {group.titleKey && showLabels ? (
              <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(group.titleKey)}
              </div>
            ) : null}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => (
                <li key={item.to}>
                  <SideNavLink
                    item={item}
                    showLabel={showLabels}
                    label={t(item.labelKey)}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

    </div>
  );
}

type SideNavLinkProps = {
  item: NavItem;
  showLabel: boolean;
  label: string;
  onNavigate?: () => void;
};

function SideNavLink({ item, showLabel, label, onNavigate }: SideNavLinkProps): JSX.Element {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
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

