import { Suspense } from 'react';
import { NotificationsWorkspace } from '@/components/notifications/notifications-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function NotificationsPage() {
  return <Suspense fallback={<RouteLoading messageKey="notificationUi.loading" />}><NotificationsWorkspace /></Suspense>;
}
