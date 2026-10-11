import { PublicationHistory } from '@/components/parent/publication-history';

export default async function Page({ params }: { params: Promise<{ studentId: string; publicationId: string }> }) {
  const { studentId, publicationId } = await params;
  return <PublicationHistory key={`${studentId}:${publicationId}`} studentId={studentId} publicationId={publicationId} />;
}
