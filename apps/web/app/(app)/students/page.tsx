import { Suspense } from 'react';
import { StudentsWorkspace } from '@/components/students/students-workspace';
import { PageLoading } from '@/components/ui/states';
import { studentCopy as t } from '@/lib/frontend/students/copy';

export default function StudentsPage() {
  return <Suspense fallback={<PageLoading label={t.loadingStudents} />}><StudentsWorkspace /></Suspense>;
}
