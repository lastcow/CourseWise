import { useMemo } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import {
  useAnnouncements,
  useAssignmentsList,
  useCourseCorrectionRequests,
  useCourseStudents,
  useDiscussionTopicsList,
  useMaterialsList,
  useMessageThreads,
  useModulesList,
  usePresentationsList,
  useQuizzesList,
} from '@/lib/queries';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  ClipboardEdit,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Library,
  ListChecks,
  Megaphone,
  MessageSquare,
  Presentation,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  Ticket,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type UserRole = 'admin' | 'teacher' | 'student';

type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
  /** Optional badge value shown to the right of the label (collapsed nav
   *  uses tooltip only). Renders as a small outlined square pill. */
  badge?: number | null;
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
  items: [
    { to: '/settings/api-tokens', labelKey: 'nav.apiTokens', icon: KeyRound },
    { to: '/settings/disclosures', labelKey: 'nav.disclosures', icon: ShieldAlert },
    {
      to: '/settings/correction-requests',
      labelKey: 'nav.correctionRequests',
      icon: ClipboardEdit,
    },
  ],
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

type CourseNavExtras = {
  activeStudentsCount?: number | null;
  modulesCount?: number | null;
  materialsCount?: number | null;
  presentationsCount?: number | null;
  assignmentsCount?: number | null;
  quizzesCount?: number | null;
  discussionsCount?: number | null;
  /** Unread only; null when 0 so the badge stays hidden when caught up. */
  messagesUnreadCount?: number | null;
  /** Unread announcements; null when caught up. */
  announcementsUnreadCount?: number | null;
  /** Open correction requests; teacher-only. */
  correctionRequestsCount?: number | null;
};

function teacherCourseSections(
  courseId: string,
  extra: CourseNavExtras = {},
): NavSection[] {
  const prefix = `/teacher/courses/${courseId}`;
  return [
    {
      id: 'top',
      items: [
        { to: prefix, labelKey: 'nav.overview', icon: Home, end: true },
        { to: `${prefix}/syllabus`, labelKey: 'nav.syllabus', icon: BookText },
        {
          to: `${prefix}/modules`,
          labelKey: 'modules.title',
          icon: Library,
          badge: extra.modulesCount ?? null,
        },
      ],
    },
    {
      id: 'learn',
      titleKey: 'course.nav.section.learn',
      items: [
        {
          to: `${prefix}/materials`,
          labelKey: 'materials.title',
          icon: FileText,
          badge: extra.materialsCount ?? null,
        },
        {
          to: `${prefix}/presentations`,
          labelKey: 'presentations.title',
          icon: Presentation,
          badge: extra.presentationsCount ?? null,
        },
      ],
    },
    {
      id: 'assessment',
      titleKey: 'course.nav.section.assessment',
      items: [
        {
          to: `${prefix}/assignments`,
          labelKey: 'assignments.title',
          icon: ClipboardList,
          badge: extra.assignmentsCount ?? null,
        },
        {
          to: `${prefix}/quizzes`,
          labelKey: 'quizzes.title',
          icon: ListChecks,
          badge: extra.quizzesCount ?? null,
        },
      ],
    },
    {
      id: 'engagement',
      titleKey: 'course.nav.section.engagement',
      items: [
        {
          to: `${prefix}/announcements`,
          labelKey: 'announcements.title',
          icon: Megaphone,
          badge: extra.announcementsUnreadCount ?? null,
        },
        {
          to: `${prefix}/discussion`,
          labelKey: 'discussion.title',
          icon: MessageSquare,
          badge: extra.discussionsCount ?? null,
        },
        { to: `${prefix}/attendance`, labelKey: 'attendance.title', icon: UserCheck },
        {
          to: `${prefix}/students`,
          labelKey: 'students.title',
          icon: Users,
          badge: extra.activeStudentsCount ?? null,
        },
        {
          to: `${prefix}/messages`,
          labelKey: 'messages.title',
          icon: Inbox,
          badge: extra.messagesUnreadCount ?? null,
        },
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
        {
          to: `${prefix}/correction-requests`,
          labelKey: 'nav.correctionRequests',
          icon: ClipboardEdit,
          badge: extra.correctionRequestsCount ?? null,
        },
        { to: `${prefix}/settings`, labelKey: 'courses.editTitle', icon: Settings },
      ],
    },
  ];
}

function studentCourseSections(
  courseId: string,
  extra: CourseNavExtras = {},
): NavSection[] {
  const prefix = `/student/courses/${courseId}`;
  return [
    {
      id: 'top',
      items: [
        { to: prefix, labelKey: 'nav.overview', icon: Home, end: true },
        { to: `${prefix}/syllabus`, labelKey: 'nav.syllabus', icon: BookText },
        {
          to: `${prefix}/modules`,
          labelKey: 'modules.title',
          icon: Library,
          badge: extra.modulesCount ?? null,
        },
      ],
    },
    {
      id: 'learn',
      titleKey: 'course.nav.section.learn',
      items: [
        {
          to: `${prefix}/materials`,
          labelKey: 'materials.title',
          icon: FileText,
          badge: extra.materialsCount ?? null,
        },
        {
          to: `${prefix}/presentations`,
          labelKey: 'presentations.title',
          icon: Presentation,
          badge: extra.presentationsCount ?? null,
        },
      ],
    },
    {
      id: 'assessment',
      titleKey: 'course.nav.section.assessment',
      items: [
        {
          to: `${prefix}/assignments`,
          labelKey: 'assignments.title',
          icon: ClipboardList,
          badge: extra.assignmentsCount ?? null,
        },
        {
          to: `${prefix}/quizzes`,
          labelKey: 'quizzes.title',
          icon: ListChecks,
          badge: extra.quizzesCount ?? null,
        },
      ],
    },
    {
      id: 'engagement',
      titleKey: 'course.nav.section.engagement',
      items: [
        {
          to: `${prefix}/announcements`,
          labelKey: 'announcements.title',
          icon: Megaphone,
          badge: extra.announcementsUnreadCount ?? null,
        },
        {
          to: `${prefix}/discussion`,
          labelKey: 'discussion.title',
          icon: MessageSquare,
          badge: extra.discussionsCount ?? null,
        },
        { to: `${prefix}/attendance`, labelKey: 'attendance.myTitle', icon: UserCheck },
        {
          to: `${prefix}/students`,
          labelKey: 'students.title',
          icon: Users,
          badge: extra.activeStudentsCount ?? null,
        },
        {
          to: `${prefix}/messages`,
          labelKey: 'messages.title',
          icon: Inbox,
          badge: extra.messagesUnreadCount ?? null,
        },
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

  // Course-scoped counts power the per-item nav badges. Each hook reuses
  // the same cached query the corresponding page subscribes to, so
  // navigating into a page after seeing the badge doesn't re-fetch.
  const activeCourseId =
    teacherCourseId && teacherCourseId !== 'new' ? teacherCourseId : studentCourseId;
  const navCourseId = activeCourseId ?? null;
  const isTeacherNavCourse = role === 'teacher' && !!navCourseId;
  const studentsQ = useCourseStudents(activeCourseId || undefined);
  const modulesQ = useModulesList(navCourseId);
  const materialsQ = useMaterialsList(navCourseId);
  const presentationsQ = usePresentationsList(navCourseId);
  const assignmentsQ = useAssignmentsList(navCourseId);
  const quizzesQ = useQuizzesList(navCourseId);
  const discussionsQ = useDiscussionTopicsList(navCourseId);
  const messageThreadsQ = useMessageThreads(navCourseId || undefined);
  const announcementsQ = useAnnouncements(navCourseId);
  const correctionRequestsQ = useCourseCorrectionRequests(
    isTeacherNavCourse ? navCourseId : null,
    'open',
  );

  const navExtras = useMemo<CourseNavExtras>(() => {
    const activeStudentsCount =
      studentsQ.data ? studentsQ.data.filter((r) => r.status === 'enrolled').length : null;
    const unread = messageThreadsQ.data
      ? messageThreadsQ.data.reduce((acc, t) => acc + (t.unreadCount ?? 0), 0)
      : 0;
    const unreadAnnouncements = announcementsQ.data
      ? announcementsQ.data.filter((a) => a.status === 'published' && !a.isRead).length
      : 0;
    return {
      activeStudentsCount,
      modulesCount: modulesQ.data ? modulesQ.data.length : null,
      materialsCount: materialsQ.data ? materialsQ.data.length : null,
      presentationsCount: presentationsQ.data ? presentationsQ.data.length : null,
      assignmentsCount: assignmentsQ.data ? assignmentsQ.data.length : null,
      quizzesCount: quizzesQ.data ? quizzesQ.data.length : null,
      discussionsCount: discussionsQ.data ? discussionsQ.data.length : null,
      // Unread-only: hide the badge when caught up so it doesn't shout
      // "0" at the user.
      messagesUnreadCount: unread > 0 ? unread : null,
      announcementsUnreadCount: unreadAnnouncements > 0 ? unreadAnnouncements : null,
      correctionRequestsCount: correctionRequestsQ.data
        ? correctionRequestsQ.data.length
        : null,
    };
  }, [
    studentsQ.data,
    modulesQ.data,
    materialsQ.data,
    presentationsQ.data,
    assignmentsQ.data,
    quizzesQ.data,
    discussionsQ.data,
    messageThreadsQ.data,
    announcementsQ.data,
    correctionRequestsQ.data,
  ]);

  const groups = useMemo<NavGroup[]>(() => {
    if (role === 'admin') return ADMIN_GROUPS;
    if (role === 'teacher') {
      if (teacherCourseId && teacherCourseId !== 'new') {
        return [
          ...TEACHER_TOP_GROUPS,
          {
            id: 'currentCourse',
            titleKey: 'nav.currentCourse',
            sections: teacherCourseSections(teacherCourseId, navExtras),
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
            sections: studentCourseSections(studentCourseId, navExtras),
          },
          SETTINGS_GROUP,
        ];
      }
      return [...STUDENT_TOP_GROUPS, SETTINGS_GROUP];
    }
    return [];
  }, [role, teacherCourseId, studentCourseId, navExtras]);

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
  const hasBadge = typeof item.badge === 'number' && item.badge >= 0;
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
      {showLabel ? (
        <>
          <span className="truncate">{label}</span>
          {hasBadge ? (
            <span
              aria-hidden
              className="ml-auto inline-flex h-5 min-w-[22px] items-center justify-center rounded border border-current px-1.5 text-[11px] font-medium leading-none tabular-nums"
            >
              {item.badge}
            </span>
          ) : null}
        </>
      ) : null}
    </NavLink>
  );
}
