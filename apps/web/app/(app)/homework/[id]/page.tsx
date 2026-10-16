import { Suspense } from 'react';
import { HomeworkDetailWorkspace } from '@/components/homework/homework-detail';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function HomeworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<RouteLoading messageKey="homework.loading" />}><HomeworkDetailWorkspace homeworkId={id} /></Suspense>;
}

