'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useAppContext } from '@/components/app/app-context';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import { notificationKeys } from '@/lib/frontend/notifications/queries';

export function NotificationUnreadBadge() {
  const app = useAppContext();
  const schoolId = app.currentSchool?.id;
  const count = useQuery({
    queryKey: notificationKeys.unreadCount(schoolId ?? 'no-school'),
    queryFn: notificationsApi.unreadCount,
    enabled: schoolId !== undefined,
  });
  const value = typeof count.data?.count === 'number' ? count.data.count : 0;
  const label = value > 0 ? `Notifications, ${value} unread` : 'Notifications';
  return (
    <Link href="/notifications" aria-label={label} title={label} className="relative grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Bell className="size-5" aria-hidden="true" />
      {value > 0 ? <span className="absolute -end-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[0.65rem] font-semibold leading-5 text-primary-foreground">{value > 99 ? '99+' : value}</span> : null}
    </Link>
  );
}
