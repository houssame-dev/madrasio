import { Suspense } from 'react';
import { TeacherDetailWorkspace } from '@/components/teachers/teacher-detail';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {

  const { id } = await params;
  return <Suspense fallback={<RouteLoading messageKey="peopleTeachers.loadingTeacher" />}><TeacherDetailWorkspace teacherId={id} /></Suspense>;
}
