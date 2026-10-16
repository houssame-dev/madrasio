import { RouteLoading } from '@/components/language/route-presentation';
import { Suspense } from 'react';
import { RecipientAnnouncements } from '@/components/announcements/recipient-announcements';
export default async function Page() { return <Suspense fallback={<RouteLoading messageKey="announcementUi.loading" />}><RecipientAnnouncements /></Suspense>; }
