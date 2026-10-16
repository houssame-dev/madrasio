import { Suspense } from 'react';
import { StudentDetailWorkspace } from '@/components/students/student-detail';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {

  const { id } = await params;
  return <Suspense fallback={<RouteLoading messageKey="peopleStudents.loadingStudent" />}><StudentDetailWorkspace studentId={id} /></Suspense>;
}
