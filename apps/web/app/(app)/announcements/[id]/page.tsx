import { Suspense } from 'react';
import { AnnouncementDetailWorkspace } from '@/components/announcements/announcement-detail';
import { PageLoading } from '@/components/ui/states';
import { announcementCopy as t } from '@/lib/frontend/announcements/copy';

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<PageLoading label={t.loading} />}><AnnouncementDetailWorkspace announcementId={id} /></Suspense>;
}
