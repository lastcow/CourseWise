import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Ticket,
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

const TEACHER_GROUPS: NavGroup[] = [
  {
    id: 'teacher',
    items: [{ to: '/teacher/courses', labelKey: 'nav.courses', icon: BookOpen, end: false }],
  },
];

const STUDENT_GROUPS: NavGroup[] = [
  {
    id: 'student',
    items: [
      { to: '/student/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { to: '/student/courses', labelKey: 'nav.courses', icon: BookOpen, end: false },
    ],
  },
];

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
  const isMobile = variant === 'mobile';
  // In mobile drawer, force expanded for readability
  const showLabels = isMobile ? true : !collapsed;

  const groups = useMemo<NavGroup[]>(() => {
    if (role === 'admin') return ADMIN_GROUPS;
    if (role === 'teacher') return TEACHER_GROUPS;
    if (role === 'student') return STUDENT_GROUPS;
    return [];
  }, [role]);

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

