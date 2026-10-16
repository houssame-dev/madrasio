import { Suspense } from 'react';
import { ParentDetailWorkspace } from '@/components/parents/parent-detail';
import { RouteLoading } from '@/components/language/route-presentation';
export default async function ParentDetailPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params; return <Suspense fallback={<RouteLoading messageKey="peopleParents.loadingParent" />}><ParentDetailWorkspace parentId={id} /></Suspense>; }
