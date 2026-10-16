import { Suspense } from 'react';
import { StudentsWorkspace } from '@/components/students/students-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function StudentsPage() {

  return <Suspense fallback={<RouteLoading messageKey="peopleStudents.loadingStudents" />}><StudentsWorkspace /></Suspense>;
}
