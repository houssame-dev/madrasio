'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pagination } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { childResultsQuery } from '@/lib/frontend/parent-portal/queries';
import type { ParentResultType } from '@/lib/frontend/parent-portal/types';

export function PublishedResults({ schoolId, studentId, yearId, type, title }: { schoolId: string; studentId: string; yearId: string; type: ParentResultType; title: string }) {
  const [page, setPage] = useState(1);
  const result = useQuery(childResultsQuery(schoolId, studentId, yearId, type, page));
  return <section className="min-w-0 rounded-lg border p-5" aria-labelledby={`${type.toLowerCase()}-results-heading`}>
    <h2 id={`${type.toLowerCase()}-results-heading`} className="text-lg font-semibold">{title}</h2>
    {result.isPending ? <InlineLoading label="Loading published results…" /> : result.isError ? <ApiErrorState title="Results unavailable" onRetry={() => void result.refetch()} /> : <>
      {!result.data.data.length ? <p>No published results.</p> : <ul className="divide-y">{result.data.data.map((row) => <li key={row.publicationId} className="space-y-2 break-words py-3">
        <p className="font-medium">{type === 'SUBJECT' ? row.subject?.name : type === 'PERIOD' ? row.academicPeriod?.name : row.academicYear.name}</p>
        <p>{row.academicYear.name}{row.academicPeriod ? ` · ${row.academicPeriod.name}` : ''}</p>
        <p className="font-semibold">{row.value}</p><p>{row.publicationVersion === 1 ? 'Published — initial publication' : 'Revised publication'} · Published revision {row.publicationVersion}</p>
        <Link className="inline-flex min-h-10 items-center underline focus-visible:ring-2" href={`/children/${studentId}/results/${row.publicationId}`}>View publication and history</Link>
      </li>)}</ul>}
      <Pagination {...result.data.meta} onPage={setPage} />
    </>}
  </section>;
}
