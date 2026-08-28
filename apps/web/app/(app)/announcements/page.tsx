import { Suspense } from 'react';
import { AnnouncementsWorkspace } from '@/components/announcements/announcements-workspace';
import { PageLoading } from '@/components/ui/states';
import { announcementCopy as t } from '@/lib/frontend/announcements/copy';

export default function AnnouncementsPage() {
  return <Suspense fallback={<PageLoading label={t.loading} />}><AnnouncementsWorkspace /></Suspense>;
}
