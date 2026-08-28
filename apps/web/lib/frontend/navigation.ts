import {
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  Home,
  Megaphone,
  School,
  Users,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';

import type { Permission } from '@/lib/authorization/permissions';
import type { Role } from '@/lib/authorization/roles';
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

export const navigationItems: readonly NavigationItem[] = [
  { label: copy.dashboard, href: '/dashboard', icon: Home },
  { label: copy.academic, href: '/academic', icon: School, permission: 'academic_structure.read' },
  { label: copy.students, href: '/students', icon: GraduationCap, permission: 'students.read', roles: STAFF_ROLES },
  { label: copy.children, href: '/children', icon: GraduationCap, permission: 'students.read', roles: ['PARENT'] },
  { label: copy.teachers, href: '/teachers', icon: UserRoundCheck, permission: 'teachers.read', roles: ADMIN_ROLES },
  { label: copy.parents, href: '/parents', icon: Users, permission: 'parents.read', roles: ADMIN_ROLES },
  { label: copy.grades, href: '/grades', icon: ClipboardList, permission: 'grades.read' },
  { label: copy.attendance, href: '/attendance', icon: CalendarCheck, permission: 'attendance.read' },
  { label: copy.homework, href: '/homework', icon: BookOpen, permission: 'homework.read', roles: STAFF_ROLES },
  { label: copy.announcements, href: '/announcements', icon: Megaphone, permission: 'announcements.read', roles: STAFF_ROLES },
  { label: copy.notifications, href: '/notifications', icon: Bell, permission: 'notifications.read' },
] as const;

export function isNavigationItemVisible(item: NavigationItem, role: Role): boolean {
  if (item.roles && !item.roles.includes(role)) return false;
  return item.permission ? can(role, item.permission) : true;
}

export function visibleNavigationItems(role: Role): NavigationItem[] {
  return navigationItems.filter((item) => isNavigationItemVisible(item, role));
}

export function isActiveNavigationPath(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}
