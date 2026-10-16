import { Suspense } from 'react';
import { ParentsWorkspace } from '@/components/parents/parents-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default async function ParentsPage() {

  return <Suspense fallback={<RouteLoading messageKey="peopleParents.loadingParents" />}><ParentsWorkspace /></Suspense>;
}
