import { Suspense } from 'react';
import { ChildDetail } from '@/components/parent/child-detail';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function ChildPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ academicYearId?: string }> }) {

  const { studentId } = await params;
  const { academicYearId } = await searchParams;
  return <Suspense fallback={<RouteLoading messageKey="parentPortal.childrenLoading" />}><ChildDetail studentId={studentId} academicYearId={academicYearId} /></Suspense>;
}
