import { Suspense } from 'react';
import { HomeworkDetailWorkspace } from '@/components/homework/homework-detail';
import { PageLoading } from '@/components/ui/states';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';

export default async function HomeworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<PageLoading label={t.loading} />}><HomeworkDetailWorkspace homeworkId={id} /></Suspense>;
}

