import { Suspense } from 'react';
import { TeacherDetailWorkspace } from '@/components/teachers/teacher-detail';
import { PageLoading } from '@/components/ui/states';
import { teacherCopy as t } from '@/lib/frontend/teachers/copy';

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<PageLoading label={t.loadingTeacher} />}><TeacherDetailWorkspace teacherId={id} /></Suspense>;
}
