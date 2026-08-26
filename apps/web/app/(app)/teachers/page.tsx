import { Suspense } from 'react';
import { TeachersWorkspace } from '@/components/teachers/teachers-workspace';
import { PageLoading } from '@/components/ui/states';
import { teacherCopy as t } from '@/lib/frontend/teachers/copy';

export default function TeachersPage() {
  return <Suspense fallback={<PageLoading label={t.loadingTeachers} />}><TeachersWorkspace /></Suspense>;
}
