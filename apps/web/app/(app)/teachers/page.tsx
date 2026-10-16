import { Suspense } from 'react';
import { TeachersWorkspace } from '@/components/teachers/teachers-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function TeachersPage() {

  return <Suspense fallback={<RouteLoading messageKey="peopleTeachers.loadingTeachers" />}><TeachersWorkspace /></Suspense>;
}
