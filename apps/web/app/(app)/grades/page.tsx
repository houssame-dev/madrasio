import { Suspense } from 'react';
import { GradebooksWorkspace } from '@/components/grades/gradebooks-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default function GradesPage() {
  return <Suspense fallback={<RouteLoading messageKey="grades.loading" />}><GradebooksWorkspace /></Suspense>;
}
