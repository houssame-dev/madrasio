import { Suspense } from 'react';
import { ParentsWorkspace } from '@/components/parents/parents-workspace';
import { PageLoading } from '@/components/ui/states';
import { parentCopy as t } from '@/lib/frontend/parents/copy';

export default function ParentsPage() {
  return <Suspense fallback={<PageLoading label={t.loadingParents} />}><ParentsWorkspace /></Suspense>;
}
