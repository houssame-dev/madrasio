import { Suspense } from 'react';
import { RecipientAnnouncements } from '@/components/announcements/recipient-announcements';
export default function Page() { return <Suspense fallback={<p>Loading announcements…</p>}><RecipientAnnouncements /></Suspense>; }
