import { Suspense } from 'react';
import { GradebookDetailWorkspace } from '@/components/grades/gradebook-detail';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function GradebookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<RouteLoading messageKey="grades.loading" />}><GradebookDetailWorkspace gradebookId={id} /></Suspense>;
}
