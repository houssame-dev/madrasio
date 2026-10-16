import { Suspense } from 'react';
import { AnnouncementsWorkspace } from '@/components/announcements/announcements-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function AnnouncementsPage() {
  return <Suspense fallback={<RouteLoading messageKey="announcementUi.loading" />}><AnnouncementsWorkspace /></Suspense>;
}
