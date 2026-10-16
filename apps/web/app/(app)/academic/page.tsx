import { Suspense } from 'react';
import { AcademicWorkspace } from '@/components/academic/academic-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default function AcademicPage() {
  return <Suspense fallback={<RouteLoading messageKey="academic.loadingWorkspace" />}><AcademicWorkspace /></Suspense>;
}
