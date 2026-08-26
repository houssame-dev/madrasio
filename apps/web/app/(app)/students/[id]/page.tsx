import { Suspense } from 'react';
import { StudentDetailWorkspace } from '@/components/students/student-detail';
import { PageLoading } from '@/components/ui/states';
import { studentCopy as t } from '@/lib/frontend/students/copy';

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<PageLoading label={t.loadingStudent} />}><StudentDetailWorkspace studentId={id} /></Suspense>;
}
