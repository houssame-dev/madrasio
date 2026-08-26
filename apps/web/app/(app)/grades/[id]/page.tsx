import { Suspense } from 'react';
import { GradebookDetailWorkspace } from '@/components/grades/gradebook-detail';
import { PageLoading } from '@/components/ui/states';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';

export default async function GradebookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<PageLoading label={t.loading} />}><GradebookDetailWorkspace gradebookId={id} /></Suspense>;
}
