import { Suspense } from 'react';
import { ResultsWorkspace } from '@/components/grades/results/results-workspace';
import { PageLoading } from '@/components/ui/states';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';

export default function ResultsPage() {
  return <Suspense fallback={<PageLoading label={t.loading} />}><ResultsWorkspace /></Suspense>;
}
