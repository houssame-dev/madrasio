import { Suspense } from 'react';
import { AnnouncementDetailWorkspace } from '@/components/announcements/announcement-detail';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<RouteLoading messageKey="announcementUi.loading" />}><AnnouncementDetailWorkspace announcementId={id} /></Suspense>;
}
