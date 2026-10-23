'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { gradesApi } from '@/lib/frontend/grades/api';
import { useGradeCopy } from '@/i18n/use-domain-copy';
import { gradeKeys } from '@/lib/frontend/grades/queries';

export function GradebookGradesPanel({ schoolId, gradebookId }: { schoolId: string; gradebookId: string }) {
  const t = useGradeCopy();
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: gradeKeys.gradeMatrix(schoolId, gradebookId, page, 20), queryFn: () => gradesApi.gradeMatrix(gradebookId, { page, pageSize: 20 }) });
  return <section className="space-y-4"><div><h2 className="text-lg font-semibold">{t.rawGrades}</h2><p className="mt-1 text-sm text-muted-foreground">{t.rawGradesDescription}</p></div>
    {query.isPending ? <InlineLoading label={t.loading} /> : query.isError ? <ApiErrorState title={t.unavailable} onRetry={() => void query.refetch()} /> : <><div className="min-w-0 xl:overflow-x-auto"><TableShell responsive headers={[t.student, ...query.data.data.assessments.map(assessment => `${assessment.title} / ${assessment.maximumScore}`)]}>{query.data.data.students.map(({ student, grades }) => <tr key={student.id}><th dir="auto" scope="row" className="px-4 py-3 text-start font-medium">{student.firstName} {student.lastName}</th>{query.data.data.assessments.map((assessment) => { const grade = grades.find((value) => value.assessmentId === assessment.id); return <td dir="auto" key={assessment.id} className="px-4 py-3">{grade ? <div className="space-y-1"><StatusBadge brand status={grade.state} label={t.gradeStates[grade.state]} />{grade.state === 'VALID' ? <div className="tabular-nums">{grade.score} / {assessment.maximumScore}</div> : null}</div> : <span className="text-muted-foreground">{t.noPersistedGrade}</span>}</td>; })}</tr>)}</TableShell></div><Pagination page={query.data.meta.page} pageSize={query.data.meta.pageSize} total={query.data.meta.total} onPage={setPage} /></>}
  </section>;
}
