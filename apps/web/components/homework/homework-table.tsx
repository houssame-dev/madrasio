'use client';

import Link from 'next/link';
import { EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import type { AcademicYearDto, PageResponse, SubjectDto } from '@/lib/frontend/academic/types';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';
import type { HomeworkDto } from '@/lib/frontend/homework/types';

export function HomeworkTable({ result, loading, years, subjects, onPage }: {
  result?: PageResponse<HomeworkDto>;
  loading: boolean;
  years: AcademicYearDto[];
  subjects: SubjectDto[];
  onPage: (page: number) => void;
}) {
  const name = (rows: { id: string; name: string }[], id: string) => rows.find((row) => row.id === id)?.name ?? '—';
  return <div className="space-y-4"><TableShell headers={[t.titleField, t.academicYear, t.subject, t.dueDate, t.status, t.actions]} loading={loading}>
    {result?.data.length === 0 ? <EmptyTableRow columns={6} /> : result?.data.map((homework) => <tr key={homework.id}>
      <td className="px-4 py-3 font-medium">{homework.title}</td><td className="px-4 py-3">{name(years, homework.academicYearId)}</td><td className="px-4 py-3">{name(subjects, homework.subjectId)}</td><td className="px-4 py-3 tabular-nums">{homework.dueDate}</td><td className="px-4 py-3"><StatusBadge status={homework.status} /></td><td className="px-4 py-3 text-end"><Link className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent" href={`/homework/${homework.id}`}>{t.details}</Link></td>
    </tr>)}
  </TableShell>{result ? <Pagination {...result.meta} onPage={onPage} /> : null}</div>;
}

