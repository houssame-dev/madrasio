'use client';
import '@/components/grades/grades.css';
import { usePeopleText } from '@/i18n/use-people-text';
import { useLocale, useTranslations } from 'next-intl';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pagination } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { childResultsQuery } from '@/lib/frontend/parent-portal/queries';
import type { ParentResultType } from '@/lib/frontend/parent-portal/types';

export function PublishedResults({ schoolId, studentId, yearId, type, title }: { schoolId: string; studentId: string; yearId: string; type: ParentResultType; title: string }) {
  const text = usePeopleText();
  const ui = useTranslations('peopleUi');
  const locale = useLocale();

  const [page, setPage] = useState(1);
  const result = useQuery(childResultsQuery(schoolId, studentId, yearId, type, page));
  return <section className="gr-workspace gr-card gr-parent-results min-w-0" aria-labelledby={`${type.toLowerCase()}-results-heading`}>
    <h2 id={`${type.toLowerCase()}-results-heading`} className="text-lg font-semibold">{title}</h2>
    {result.isPending ? <InlineLoading label={text("Loading published results…")} /> : result.isError ? <ApiErrorState title={text("Results unavailable")} onRetry={() => void result.refetch()} /> : <>
      {!result.data.data.length ? <p>{text("No published results.")}</p> : <ul className="gr-published-list">{result.data.data.map((row) => <li key={row.publicationId} className="space-y-2 break-words py-3 gr-published-record">
        <p className="font-medium"><bdi>{type === 'SUBJECT' ? row.subject?.name : type === 'PERIOD' ? row.academicPeriod?.name : row.academicYear.name}</bdi></p>
        <p><bdi>{row.academicYear.name}</bdi>{row.academicPeriod ? <> · <bdi>{row.academicPeriod.name}</bdi></> : null}</p>
        <p dir="ltr" className="font-semibold">{row.value}</p><p>{row.publicationVersion === 1 ? text("Published — initial publication") : text("Revised publication")} · {ui('revision', { version: row.publicationVersion })}</p>
        <p className="text-xs text-muted-foreground"><time dateTime={row.publishedAt}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(row.publishedAt))}</time></p><Link className="inline-flex min-h-10 items-center underline focus-visible:ring-2" href={`/children/${studentId}/results/${row.publicationId}`}>{text("View publication and history")}</Link>
      </li>)}</ul>}
      <Pagination {...result.data.meta} onPage={setPage} />
    </>}
  </section>;
}
