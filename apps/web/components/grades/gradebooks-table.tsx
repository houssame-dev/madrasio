'use client';

import { useQueries } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicPeriodDto, AcademicYearDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import type { GradebookDto, PageResponse } from '@/lib/frontend/grades/types';

export function GradebooksTable({ schoolId, result, loading, years, classes, subjects, onPage }: {
  schoolId: string;
  result?: PageResponse<GradebookDto>;
  loading: boolean;
  years: AcademicYearDto[];
  classes: ClassDto[];
  subjects: SubjectDto[];
  onPage: (page: number) => void;
}) {
  const yearIds = [...new Set((result?.data ?? []).map((row) => row.academicYearId))];
  const periodQueries = useQueries({ queries: yearIds.map((yearId) => ({
    queryKey: academicKeys.selectors(schoolId, `periods:${yearId}`),
    queryFn: () => listAllResource<AcademicPeriodDto>(`/api/v1/academic-years/${yearId}/periods`),
  })) });
  const periods = periodQueries.flatMap((query) => query.data ?? []);
  const yearName = new Map(years.map((row) => [row.id, row.name]));
  const periodName = new Map(periods.map((row) => [row.id, row.name]));
  const className = new Map(classes.map((row) => [row.id, row.name]));
  const subjectName = new Map(subjects.map((row) => [row.id, row.name]));

  return <div className="space-y-4">
    <TableShell headers={[t.name, t.academicYear, t.period, t.class, t.subject, t.configurationVersion, t.status, t.actions]} loading={loading}>
      {result?.data.length === 0 ? <EmptyTableRow columns={8} /> : result?.data.map((gradebook) => {
        const label = gradebook.name ?? `${className.get(gradebook.classId) ?? t.unknown} · ${subjectName.get(gradebook.subjectId) ?? t.unknown}`;
        return <tr key={gradebook.id}>
          <td className="px-4 py-3 font-medium">{label}</td>
          <td className="px-4 py-3">{yearName.get(gradebook.academicYearId) ?? t.unknown}</td>
          <td className="px-4 py-3">{periodName.get(gradebook.academicPeriodId) ?? t.unknown}</td>
          <td className="px-4 py-3">{className.get(gradebook.classId) ?? t.unknown}</td>
          <td className="px-4 py-3">{subjectName.get(gradebook.subjectId) ?? t.unknown}</td>
          <td className="px-4 py-3 font-mono text-xs">{gradebook.gradingConfigurationVersionId}</td>
          <td className="px-4 py-3"><StatusBadge status={gradebook.status} /></td>
          <td className="px-4 py-3 text-end"><Link href={`/grades/${gradebook.id}`} aria-label={t.openDetail(label)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t.open}<ExternalLink className="size-4" aria-hidden="true" /></Link></td>
        </tr>;
      })}
    </TableShell>
    {result ? <Pagination {...result.meta} onPage={onPage} /> : null}
  </div>;
}
