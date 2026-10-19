import {
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  Home,
  Wallet,
  Megaphone,
  School,
  Users,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';

import type { Permission } from '@/lib/authorization/permissions';
import type { Role } from '@/lib/authorization/roles';
import type { Messages } from '@/i18n/catalogs';
import { copy } from './copy';
import { can } from './permissions';

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  roles?: readonly Role[];
}

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'SUPER_ADMIN'] as const satisfies readonly Role[];
const STAFF_ROLES = ['SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'] as const satisfies readonly Role[];

// Keep the public English-label contract for existing non-rendering consumers.
interface LocalizedNavigationItem extends NavigationItem {
  labelKey: keyof Messages['navigation']['items'];
}

export const navigationItems: readonly LocalizedNavigationItem[] = [
  { label: copy.dashboard, labelKey: 'dashboard', href: '/dashboard', icon: Home },
  { label: 'Finance', labelKey: 'finance', href: '/finance', icon: Wallet, permission: 'finance.read', roles: ['SCHOOL_ADMIN'] },
  { label: 'Timetable', labelKey: 'timetable', href: '/timetable', icon: CalendarCheck, permission: 'timetable.read', roles: ['SCHOOL_ADMIN', 'TEACHER', 'PARENT'] },
  { label: copy.academic, labelKey: 'academic', href: '/academic', icon: School, permission: 'academic_structure.read' },
  { label: copy.students, labelKey: 'students', href: '/students', icon: GraduationCap, permission: 'students.read', roles: STAFF_ROLES },
  { label: copy.myChildren, labelKey: 'myChildren', href: '/children', icon: GraduationCap, permission: 'students.read', roles: ['PARENT'] },
  { label: copy.teachers, labelKey: 'teachers', href: '/teachers', icon: UserRoundCheck, permission: 'teachers.read', roles: STAFF_ROLES },
  { label: copy.parents, labelKey: 'parents', href: '/parents', icon: Users, permission: 'parents.read', roles: ADMIN_ROLES },
  { label: copy.grades, labelKey: 'grades', href: '/grades', icon: ClipboardList, permission: 'grades.read', roles: STAFF_ROLES },
  { label: copy.attendance, labelKey: 'attendance', href: '/attendance', icon: CalendarCheck, permission: 'attendance.read', roles: STAFF_ROLES },
  { label: copy.homework, labelKey: 'homework', href: '/homework', icon: BookOpen, permission: 'homework.read', roles: STAFF_ROLES },
  { label: copy.announcements, labelKey: 'announcements', href: '/announcements', icon: Megaphone, permission: 'announcements.read', roles: STAFF_ROLES },
  { label: 'School announcements', labelKey: 'schoolAnnouncements', href: '/announcements/inbox', icon: Megaphone, permission: 'announcements.read', roles: ['PARENT', 'TEACHER'] },
  { label: copy.notifications, labelKey: 'notifications', href: '/notifications', icon: Bell, permission: 'notifications.read' },
] as const;

export function isNavigationItemVisible(item: NavigationItem, role: Role): boolean {
  if (item.roles && !item.roles.includes(role)) return false;
  return item.permission ? can(role, item.permission) : true;
}

export function visibleNavigationItems(role: Role): LocalizedNavigationItem[] {
  return navigationItems.filter((item) => isNavigationItemVisible(item, role));
}

export function isActiveNavigationPath(pathname: string, href: string): boolean {
  if (href === '/announcements' && pathname.startsWith('/announcements/inbox')) return false;
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}
