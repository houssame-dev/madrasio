'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@school/ui';
import { ApiErrorState } from '@/components/ui/states';
import { EmptyTableRow, Modal, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import type { AcademicYearDto, ClassDto } from '@/lib/frontend/academic/types';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentCopy as t } from '@/lib/frontend/students/copy';
import { studentKeys } from '@/lib/frontend/students/queries';
import type { EnrollmentDto } from '@/lib/frontend/students/types';
import { useState } from 'react';
import { EndEnrollmentForm } from './enrollment-forms';

const resourceName = (rows: { id: string; name: string }[], id: string) => rows.find((row) => row.id === id)?.name ?? t.unknown;

export function EnrollmentHistory({ schoolId, studentId, years, classes, page, canManage, onPage, onChanged }: { schoolId: string; studentId: string; years: AcademicYearDto[]; classes: ClassDto[]; page: number; canManage: boolean; onPage: (page: number) => void; onChanged: () => Promise<void> | void }) {
  const [ending, setEnding] = useState<EnrollmentDto>();
  const params = { page, pageSize: 20 };
  const query = useQuery({ queryKey: studentKeys.enrollments(schoolId, studentId, params), queryFn: () => studentsApi.enrollments(studentId, params) });
  if (query.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void query.refetch()} />;
  return <section className="space-y-4"><div><h2 className="text-lg font-semibold">{t.enrollmentHistory}</h2><p className="mt-1 text-sm text-muted-foreground">{t.historyEmptyDescription}</p></div>
    <TableShell headers={[t.academicYear, t.className, t.effectiveFrom, t.effectiveUntil, t.status, t.actions]} loading={query.isPending}>
      {query.data?.data.length === 0 ? <EmptyTableRow columns={6} /> : query.data?.data.map((enrollment) => <tr key={enrollment.id}><td className="px-4 py-3">{resourceName(years, enrollment.academicYearId)}</td><td className="px-4 py-3 font-medium">{resourceName(classes, enrollment.classId)}</td><td className="px-4 py-3">{enrollment.effectiveFrom}</td><td className="px-4 py-3">{enrollment.effectiveUntil ?? t.ongoing}</td><td className="px-4 py-3"><StatusBadge status={enrollment.status} /></td><td className="px-4 py-3 text-end">{canManage && enrollment.status === 'ACTIVE' ? <Button type="button" variant="outline" size="sm" onClick={() => setEnding(enrollment)}>{t.endEnrollment}</Button> : null}</td></tr>)}
    </TableShell>{query.data ? <Pagination {...query.data.meta} onPage={onPage} /> : null}
    <Modal open={ending != null} title={t.endEnrollment} description={t.endDescription} onClose={() => setEnding(undefined)}>{ending ? <EndEnrollmentForm enrollment={ending} onCancel={() => setEnding(undefined)} onSaved={async () => { await onChanged(); setEnding(undefined); }} /> : null}</Modal>
  </section>;
}
