'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { EmptyTableRow, Modal, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { ApiErrorState } from '@/components/ui/states';
import type { AcademicYearDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { teachersApi } from '@/lib/frontend/teachers/api';
import { teacherCopy as t } from '@/lib/frontend/teachers/copy';
import { teacherKeys } from '@/lib/frontend/teachers/queries';
import type { TeacherAssignmentDto } from '@/lib/frontend/teachers/types';
import { EndAssignmentForm } from './assignment-form';

const resourceName = (rows: { id: string; name: string }[], id: string) => rows.find((row) => row.id === id)?.name ?? t.unknown;

export function AssignmentsPanel({ schoolId, teacherId, years, classes, subjects, page, canManage, onPage, onChanged }: { schoolId: string; teacherId: string; years: AcademicYearDto[]; classes: ClassDto[]; subjects: SubjectDto[]; page: number; canManage: boolean; onPage: (page: number) => void; onChanged: () => Promise<void> | void }) {
  const [ending, setEnding] = useState<TeacherAssignmentDto>(); const params = { page, pageSize: 20 };
  const query = useQuery({ queryKey: teacherKeys.assignments(schoolId, teacherId, params), queryFn: () => teachersApi.assignments(teacherId, params) });
  if (query.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void query.refetch()} />;
  return <section className="space-y-4"><div><h2 className="text-lg font-semibold">{t.assignmentHistory}</h2><p className="mt-1 text-sm text-muted-foreground">{t.assignmentDescription}</p></div>
    <TableShell headers={[t.academicYear, t.className, t.subject, t.effectiveFrom, t.effectiveUntil, t.status, t.actions]} loading={query.isPending}>
      {query.data?.data.length === 0 ? <EmptyTableRow columns={7} /> : query.data?.data.map((assignment) => <tr key={assignment.id}><td className="px-4 py-3">{resourceName(years, assignment.academicYearId)}</td><td className="px-4 py-3 font-medium">{resourceName(classes, assignment.classId)}</td><td className="px-4 py-3">{resourceName(subjects, assignment.subjectId)}</td><td className="px-4 py-3">{assignment.effectiveFrom}</td><td className="px-4 py-3">{assignment.effectiveUntil ?? t.ongoing}</td><td className="px-4 py-3"><StatusBadge status={assignment.status} /></td><td className="px-4 py-3 text-end">{canManage && assignment.status === 'ACTIVE' ? <Button type="button" variant="outline" size="sm" onClick={() => setEnding(assignment)}>{t.endAssignment}</Button> : null}</td></tr>)}
    </TableShell>{query.data ? <Pagination {...query.data.meta} onPage={onPage} /> : null}
    <Modal open={ending != null} title={t.endAssignment} description={t.endDescription} onClose={() => setEnding(undefined)}>{ending ? <EndAssignmentForm assignment={ending} onCancel={() => setEnding(undefined)} onSaved={async () => { await onChanged(); setEnding(undefined); }} /> : null}</Modal>
  </section>;
}
