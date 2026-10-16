'use client';
import { usePeopleText } from '@/i18n/use-people-text';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { PublicationHistoryPage } from '@/lib/frontend/grades/publications';
import { Snapshot } from '@/components/grades/results/publication-snapshot';
import { Pagination } from '@/components/academic/ui';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { apiRequest } from '@/lib/frontend/api-client';

export function PublicationHistory({ studentId, publicationId }: { studentId: string; publicationId: string }) {
  const text = usePeopleText();

  const { currentSchool } = useAppContext();
  const contextKey = `${currentSchool?.id}:${studentId}:${publicationId}`;
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const page = paging.key === contextKey ? paging.page : 1;
  const result = useQuery({ queryKey: ['child-publication', currentSchool?.id, studentId, publicationId, page],
    queryFn: () => apiRequest<PublicationHistoryPage>(`/api/v1/parent/children/${studentId}/publications/${publicationId}?page=${page}`), enabled: currentSchool?.role === 'PARENT' });
  return <div className="mx-auto max-w-3xl space-y-5 p-4"><Link href={`/children/${studentId}`} className="inline-flex min-h-10 items-center underline">{text("Back to child")}</Link>
    <h1 className="text-2xl font-semibold">{text("Published result")}</h1>
    <p>{text("Only published snapshots are shown. Calculated and finalized results are not visible until publication. Revisions preserve earlier publications.")}</p>
    {currentSchool?.role !== 'PARENT' ? <p>{text("Published result unavailable.")}</p> : result.isPending ? <InlineLoading label={text("Loading publication…")} /> : result.isError ? <ApiErrorState title={text("Published result unavailable")} description={text("Return to My children if your access has changed.")} onRetry={() => void result.refetch()} /> : <>
      <section className="rounded-lg border p-4" aria-label={text("Selected publication")}><Snapshot value={result.data.selected} /></section>
      <h2 className="text-xl font-semibold">{text("Publication history")}</h2>
      <ol className="space-y-3">{result.data.data.map((item) => <li key={item.publicationId} className="rounded-lg border p-4"><Snapshot value={item} /></li>)}</ol>
      <Pagination {...result.data.meta} onPage={(next) => setPaging({ key: contextKey, page: next })} />
    </>}
  </div>;
}
