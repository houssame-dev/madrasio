import { Suspense } from 'react';
import { ChildDetail } from '@/components/parent/child-detail';
import { PageLoading } from '@/components/ui/states';
import { parentPortalCopy as t } from '@/lib/frontend/parent-portal/copy';

export default async function ChildPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ academicYearId?: string }> }) {
  const { studentId } = await params;
  const { academicYearId } = await searchParams;
  return <Suspense fallback={<PageLoading label={t.childrenLoading} />}><ChildDetail studentId={studentId} academicYearId={academicYearId} /></Suspense>;
}
