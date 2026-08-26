import { Suspense } from 'react';
import { GradebooksWorkspace } from '@/components/grades/gradebooks-workspace';
import { PageLoading } from '@/components/ui/states';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';

export default function GradesPage() {
  return <Suspense fallback={<PageLoading label={t.loading} />}><GradebooksWorkspace /></Suspense>;
}
