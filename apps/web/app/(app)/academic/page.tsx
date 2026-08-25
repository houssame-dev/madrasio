import { Suspense } from 'react';
import { AcademicWorkspace } from '@/components/academic/academic-workspace';
import { PageLoading } from '@/components/ui/states';
import { academicCopy as t } from '@/lib/frontend/academic/copy';

export default function AcademicPage() {
  return <Suspense fallback={<PageLoading label={t.loadingWorkspace} />}><AcademicWorkspace /></Suspense>;
}
