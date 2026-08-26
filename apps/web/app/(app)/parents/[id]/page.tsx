import { Suspense } from 'react';
import { ParentDetailWorkspace } from '@/components/parents/parent-detail';
import { PageLoading } from '@/components/ui/states';
import { parentCopy as t } from '@/lib/frontend/parents/copy';
export default async function ParentDetailPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Suspense fallback={<PageLoading label={t.loadingParent} />}><ParentDetailWorkspace parentId={id} /></Suspense>; }
