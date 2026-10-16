'use client';

import Link from 'next/link';
import { useDomainText } from '@/i18n/use-domain-text';
import { EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import type { AcademicYearDto, PageResponse, SubjectDto } from '@/lib/frontend/academic/types';
import { useHomeworkCopy } from '@/i18n/use-domain-copy';
import type { HomeworkDto } from '@/lib/frontend/homework/types';

export function HomeworkTable({ result, loading, years, subjects, onPage }: {
  result?: PageResponse<HomeworkDto>;
  loading: boolean;
  years: AcademicYearDto[];
  subjects: SubjectDto[];
  onPage: (page: number) => void;
}) {
  const text = useDomainText();
  const t = useHomeworkCopy();
  const name = (rows: { id: string; name: string }[], id: string) => rows.find((row) => row.id === id)?.name ?? '—';
  return <div className="space-y-4"><TableShell headers={[t.titleField, t.academicYear, t.subject, t.dueDate, t.status, t.actions]} loading={loading}>
    {result?.data.length === 0 ? <EmptyTableRow columns={6} /> : result?.data.map((homework) => <tr key={homework.id}>
      <td dir="auto" className="px-4 py-3 font-medium">{homework.title}</td><td dir="auto" className="px-4 py-3">{name(years, homework.academicYearId)}</td><td dir="auto" className="px-4 py-3">{name(subjects, homework.subjectId)}</td><td dir="auto" className="px-4 py-3 tabular-nums">{homework.dueDate}</td><td dir="auto" className="px-4 py-3"><StatusBadge status={homework.status} label={text(homework.status)} /></td><td dir="auto" className="px-4 py-3 text-end"><Link className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent" href={`/homework/${homework.id}`}>{t.details}</Link></td>
    </tr>)}
  </TableShell>{result ? <Pagination {...result.meta} onPage={onPage} /> : null}</div>;
}

