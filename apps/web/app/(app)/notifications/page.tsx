import { Suspense } from 'react';
import { NotificationsWorkspace } from '@/components/notifications/notifications-workspace';
import { PageLoading } from '@/components/ui/states';
import { notificationCopy as t } from '@/lib/frontend/notifications/copy';

export default function NotificationsPage() {
  return <Suspense fallback={<PageLoading label={t.loading} />}><NotificationsWorkspace /></Suspense>;
}
