'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pagination, StatusBadge } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeKeys } from '@/lib/frontend/grades/queries';

export function GradebookGradesPanel({ schoolId, gradebookId }: { schoolId: string; gradebookId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: gradeKeys.gradeMatrix(schoolId, gradebookId, page), queryFn: () => gradesApi.gradeMatrix(gradebookId, { page, pageSize: 20 }) });
  return <section className="space-y-4"><div><h2 className="text-lg font-semibold">{t.rawGrades}</h2><p className="mt-1 text-sm text-muted-foreground">{t.rawGradesDescription}</p></div>
    {query.isPending ? <InlineLoading label={t.loading} /> : query.isError ? <ApiErrorState title={t.unavailable} onRetry={() => void query.refetch()} /> : <><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-max text-sm"><thead className="border-b bg-muted/60"><tr><th className="sticky start-0 z-10 bg-muted px-4 py-3 text-start">{t.student}</th>{query.data.data.assessments.map((assessment) => <th key={assessment.id} className="min-w-36 px-4 py-3 text-start"><span className="block">{assessment.title}</span><span className="text-xs font-normal text-muted-foreground">/ {assessment.maximumScore}</span></th>)}</tr></thead><tbody className="divide-y">{query.data.data.students.map(({ student, grades }) => <tr key={student.id}><th scope="row" className="sticky start-0 bg-background px-4 py-3 text-start font-medium">{student.firstName} {student.lastName}</th>{query.data.data.assessments.map((assessment) => { const grade = grades.find((value) => value.assessmentId === assessment.id); return <td key={assessment.id} className="px-4 py-3">{grade ? <div className="space-y-1"><StatusBadge status={grade.state} />{grade.state === 'VALID' ? <div className="tabular-nums">{grade.score} / {assessment.maximumScore}</div> : null}</div> : <span className="text-muted-foreground">{t.noPersistedGrade}</span>}</td>; })}</tr>)}</tbody></table></div><Pagination page={query.data.meta.page} pageSize={query.data.meta.pageSize} total={query.data.meta.total} onPage={setPage} /></>}
  </section>;
}
