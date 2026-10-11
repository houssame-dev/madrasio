import { RecipientAnnouncement } from '@/components/announcements/recipient-announcements';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecipientAnnouncement publicationId={id} />;
}
