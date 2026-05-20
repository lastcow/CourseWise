import { useMemo } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
  KeyRound,
  LayoutDashboard,
  Library,
  ListChecks,
  MessageSquare,
  Presentation,
  Settings,
  Sliders,
  Sparkles,
  Ticket,
  UserCheck,
  UserPlus,
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

type NavSection = {
  id: string;
  // Omit titleKey for the standalone block at the top of a sectioned group
  // (e.g. Overview / course Settings).
  titleKey?: string;
  items: NavItem[];
};

type NavGroup = {
  id: string;
  titleKey?: string;
  items?: NavItem[];
  sections?: NavSection[];
};

const SETTINGS_GROUP: NavGroup = {
  id: 'settings',
  titleKey: 'nav.settingsSection',
  items: [{ to: '/settings/api-tokens', labelKey: 'nav.apiTokens', icon: KeyRound }],
};

const ADMIN_GROUPS: NavGroup[] = [
  {
    id: 'admin',
    items: [
      { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { to: '/admin/courses', labelKey: 'nav.adminCourses', icon: BookOpen },
      { to: '/admin/alerts', labelKey: 'nav.alerts', icon: AlertTriangle },
      { to: '/admin/invitation-codes', labelKey: 'nav.invitationCodes', icon: Ticket },
    ],
  },
  {
    id: 'users',
    titleKey: 'nav.users',
    items: [{ to: '/admin/teachers', labelKey: 'nav.inviteTeacher', icon: UserPlus }],
  },
  {
    id: 'ai',
    titleKey: 'nav.aiSection',
    items: [{ to: '/admin/ai', labelKey: 'nav.aiProviders', icon: Sparkles }],
  },
  SETTINGS_GROUP,
];

const TEACHER_TOP_GROUPS: NavGroup[] = [
  {
    id: 'teacher',
    items: [
      { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { to: '/teacher/courses', labelKey: 'nav.courses', icon: BookOpen, end: false },
    ],
  },
];

const STUDENT_TOP_GROUPS: NavGroup[] = [
  {
    id: 'student',
    items: [
      { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { to: '/student/courses', labelKey: 'nav.courses', icon: BookOpen, end: false },
    ],
  },
];

function teacherCourseSections(courseId: string): NavSection[] {
  const prefix = `/teacher/courses/${courseId}`;
  return [
    {
      id: 'top',
      items: [
        { to: prefix, labelKey: 'nav.overview', icon: Home, end: true },
        { to: `${prefix}/modules`, labelKey: 'modules.title', icon: Library },
      ],
    },
    {
      id: 'learn',
      titleKey: 'course.nav.section.learn',
      items: [
        { to: `${prefix}/materials`, labelKey: 'materials.title', icon: FileText },
        { to: `${prefix}/presentations`, labelKey: 'presentations.title', icon: Presentation },
      ],
    },
    {
      id: 'assessment',
      titleKey: 'course.nav.section.assessment',
      items: [
        { to: `${prefix}/assignments`, labelKey: 'assignments.title', icon: ClipboardList },
        { to: `${prefix}/quizzes`, labelKey: 'quizzes.title', icon: ListChecks },
      ],
    },
    {
      id: 'engagement',
      titleKey: 'course.nav.section.engagement',
      items: [
        { to: `${prefix}/discussion`, labelKey: 'discussion.title', icon: MessageSquare },
        { to: `${prefix}/attendance`, labelKey: 'attendance.title', icon: UserCheck },
      ],
    },
    {
      id: 'performance',
      titleKey: 'course.nav.section.performance',
      items: [
        { to: `${prefix}/gradebook`, labelKey: 'grading.gradebookTitle', icon: GraduationCap },
        { to: `${prefix}/grading-policy`, labelKey: 'grading.policyTitle', icon: Sliders },
        { to: `${prefix}/alerts`, labelKey: 'nav.alerts', icon: AlertTriangle },
      ],
    },
    {
      id: 'manage',
      titleKey: 'course.nav.section.manage',
      items: [
        { to: `${prefix}/invitations`, labelKey: 'invitations.title', icon: UserPlus },
        { to: `${prefix}/settings`, labelKey: 'courses.editTitle', icon: Settings },
      ],
    },
  ];
}

function studentCourseSections(courseId: string): NavSection[] {
  const prefix = `/student/courses/${courseId}`;
  return [
    {
      id: 'top',
      items: [
        { to: prefix, labelKey: 'nav.overview', icon: Home, end: true },
        { to: `${prefix}/modules`, labelKey: 'modules.title', icon: Library },
      ],
    },
    {
      id: 'learn',
      titleKey: 'course.nav.section.learn',
      items: [
        { to: `${prefix}/materials`, labelKey: 'materials.title', icon: FileText },
        { to: `${prefix}/presentations`, labelKey: 'presentations.title', icon: Presentation },
      ],
    },
    {
      id: 'assessment',
      titleKey: 'course.nav.section.assessment',
      items: [
        { to: `${prefix}/assignments`, labelKey: 'assignments.title', icon: ClipboardList },
        { to: `${prefix}/quizzes`, labelKey: 'quizzes.title', icon: ListChecks },
      ],
    },
    {
      id: 'engagement',
      titleKey: 'course.nav.section.engagement',
      items: [
        { to: `${prefix}/discussion`, labelKey: 'discussion.title', icon: MessageSquare },
        { to: `${prefix}/attendance`, labelKey: 'attendance.myTitle', icon: UserCheck },
      ],
    },
    {
      id: 'performance',
      titleKey: 'course.nav.section.performance',
      items: [{ to: `${prefix}/grade`, labelKey: 'nav.myGrade', icon: GraduationCap }],
    },
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
  // Contextual per-course items keep the global nav fully populated on course detail
  // routes (the course-scoped sidebar from CourseLayout still renders alongside it).
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
      if (teacherCourseId && teacherCourseId !== 'new') {
        return [
          ...TEACHER_TOP_GROUPS,
          {
            id: 'currentCourse',
            titleKey: 'nav.currentCourse',
            sections: teacherCourseSections(teacherCourseId),
          },
          SETTINGS_GROUP,
        ];
      }
      return [...TEACHER_TOP_GROUPS, SETTINGS_GROUP];
    }
    if (role === 'student') {
      if (studentCourseId) {
        return [
          ...STUDENT_TOP_GROUPS,
          {
            id: 'currentCourse',
            titleKey: 'nav.currentCourse',
            sections: studentCourseSections(studentCourseId),
          },
          SETTINGS_GROUP,
        ];
      }
      return [...STUDENT_TOP_GROUPS, SETTINGS_GROUP];
    }
    return [];
  }, [role, teacherCourseId, studentCourseId]);

  return (
    <div
      className={cn('flex h-full w-full flex-col bg-card text-card-foreground', isMobile && 'w-72')}
      aria-label={t('nav.sideMenu')}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b px-3',
          showLabels ? 'justify-between' : 'justify-center',
        )}
      >
        {showLabels ? <span className="text-sm font-semibold">{t('app.name')}</span> : null}
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
            {group.sections ? (
              <SectionedGroupItems
                sections={group.sections}
                showLabels={showLabels}
                onNavigate={onNavigate}
                t={t}
              />
            ) : group.items ? (
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
            ) : null}
          </div>
        ))}
      </nav>
    </div>
  );
}

type SectionedGroupItemsProps = {
  sections: NavSection[];
  showLabels: boolean;
  onNavigate?: () => void;
  t: TFunction;
};

function SectionedGroupItems({
  sections,
  showLabels,
  onNavigate,
  t,
}: SectionedGroupItemsProps): JSX.Element {
  // Drop sections that have no visible items so we never render an empty header
  // (defensive — current role filters always leave at least one item per section).
  const visibleSections = sections.filter((s) => s.items.length > 0);
  return (
    <>
      {visibleSections.map((section, index) => {
        const label = section.titleKey ? t(section.titleKey) : undefined;
        const showHeader = Boolean(label) && showLabels;
        // Collapsed mode replaces section headers with a thin divider between groups.
        const showDivider = !showLabels && index > 0;
        return (
          <div
            key={section.id}
            role={label ? 'group' : undefined}
            aria-label={label}
            className={showHeader ? 'mt-2 first:mt-0' : undefined}
          >
            {showDivider ? (
              <div role="separator" aria-hidden className="mx-3 my-2 border-t border-border" />
            ) : null}
            {showHeader ? (
              <div className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </div>
            ) : null}
            <ul className="space-y-0.5 px-2">
              {section.items.map((item) => (
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
        );
      })}
    </>
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
