import { Suspense } from 'react';
import { ResultsWorkspace } from '@/components/grades/results/results-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default function ResultsPage() {
  return <Suspense fallback={<RouteLoading messageKey="grades.loading" />}><ResultsWorkspace /></Suspense>;
}
