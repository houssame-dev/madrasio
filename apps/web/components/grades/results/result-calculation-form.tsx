'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { Field, InlineFeedback, selectClassName } from '@/components/academic/ui';
import { listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicPeriodDto, AcademicYearDto, ClassDto } from '@/lib/frontend/academic/types';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeErrorDetail, gradeErrorMessage } from '@/lib/frontend/grades/errors';
import { gradeKeys, invalidateResult } from '@/lib/frontend/grades/queries';
import type { GradebookDto, ResultDto, ResultType } from '@/lib/frontend/grades/types';
import { studentsApi } from '@/lib/frontend/students/api';

export function ResultCalculationForm({ schoolId, resultType, gradebooks, years, classes, gradebookLabel, onCancel, onCalculated }: {
  schoolId: string;
  resultType: ResultType;
  gradebooks: GradebookDto[];
  years: AcademicYearDto[];
  classes: ClassDto[];
  gradebookLabel: (gradebook: GradebookDto) => string;
  onCancel: () => void;
  onCalculated: (result: ResultDto) => void;
}) {
  const queryClient = useQueryClient();
  const [gradebookId, setGradebookId] = useState(''); const [academicYearId, setAcademicYearId] = useState(''); const [academicPeriodId, setAcademicPeriodId] = useState(''); const [classId, setClassId] = useState(''); const [studentId, setStudentId] = useState(''); const [validation, setValidation] = useState<string>();
  const periods = useQuery({ queryKey: academicKeys.selectors(schoolId, `periods:${academicYearId || 'none'}`), queryFn: () => listAllResource<AcademicPeriodDto>(`/api/v1/academic-years/${academicYearId}/periods`), enabled: resultType === 'PERIOD' && !!academicYearId });
  const subjectStudents = useQuery({ queryKey: [...gradeKeys.gradeMatrices(schoolId, gradebookId), 'all-students'], queryFn: () => gradesApi.allGradebookStudents(gradebookId), enabled: resultType === 'SUBJECT' && !!gradebookId });
  const aggregateStudents = useQuery({ queryKey: ['students', schoolId, 'result-selector', academicYearId, classId], queryFn: () => studentsApi.all({ academicYearId, classId }), enabled: resultType !== 'SUBJECT' && !!academicYearId && !!classId });
  const availableClasses = classes.filter((value) => value.academicYearId === academicYearId);
  const students = resultType === 'SUBJECT' ? (subjectStudents.data ?? []).map((value) => value.student) : aggregateStudents.data ?? [];
  const mutation = useMutation({
    mutationFn: async () => {
      if (resultType === 'SUBJECT') return gradesApi.calculateSubject({ gradebookId, studentId });
      if (resultType === 'PERIOD') return gradesApi.calculatePeriod({ studentId, academicYearId, academicPeriodId, classId });
      return gradesApi.calculateAnnual({ studentId, academicYearId, classId });
    },
    onSuccess: async (result) => { await invalidateResult(queryClient, schoolId, resultType, result.id); onCalculated(result); },
  });
  const submit = () => {
    const missing = resultType === 'SUBJECT' ? !gradebookId || !studentId : !academicYearId || !classId || !studentId || (resultType === 'PERIOD' && !academicPeriodId);
    if (missing) { setValidation(t.selectAllContext); return; }
    setValidation(undefined); mutation.mutate();
  };
  const detail = mutation.isError ? gradeErrorDetail(mutation.error) : null;
  return <div className="space-y-4">
    {validation ? <InlineFeedback kind="error">{validation}</InlineFeedback> : null}
    {mutation.isError ? <InlineFeedback kind="error"><div><p className="font-medium">{gradeErrorMessage(mutation.error)}</p>{detail ? <><p className="mt-1">{detail.reason}</p>{detail.details.length ? <ul className="mt-1 list-disc ps-5">{detail.details.map((value) => <li key={value}>{value}</li>)}</ul> : null}</> : null}</div></InlineFeedback> : null}
    {resultType === 'SUBJECT' ? <Field label={t.gradebooks} htmlFor="result-gradebook"><select id="result-gradebook" className={selectClassName} value={gradebookId} onChange={(event) => { setGradebookId(event.target.value); setStudentId(''); }}><option value="">{t.selectGradebook}</option>{gradebooks.map((gradebook) => <option key={gradebook.id} value={gradebook.id}>{gradebookLabel(gradebook)}</option>)}</select></Field> : <><Field label={t.academicYear} htmlFor="result-year"><select id="result-year" className={selectClassName} value={academicYearId} onChange={(event) => { setAcademicYearId(event.target.value); setAcademicPeriodId(''); setClassId(''); setStudentId(''); }}><option value="">{t.selectYear}</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></Field>{resultType === 'PERIOD' ? <Field label={t.period} htmlFor="result-period"><select id="result-period" className={selectClassName} disabled={!academicYearId || periods.isPending} value={academicPeriodId} onChange={(event) => setAcademicPeriodId(event.target.value)}><option value="">{t.selectPeriod}</option>{periods.data?.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></Field> : null}<Field label={t.class} htmlFor="result-class"><select id="result-class" className={selectClassName} disabled={!academicYearId} value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId(''); }}><option value="">{t.selectClass}</option>{availableClasses.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}</select></Field></>}
    <Field label={t.student} htmlFor="result-student"><select id="result-student" className={selectClassName} disabled={(resultType === 'SUBJECT' ? subjectStudents.isPending || !gradebookId : aggregateStudents.isPending || !classId)} value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">{t.selectStudent}</option>{students.map((student) => <option key={student.id} value={student.id}>{student.lastName}, {student.firstName}{student.studentCode ? ` (${student.studentCode})` : ''}</option>)}</select></Field>
    <p className="text-sm text-muted-foreground">{resultType === 'PERIOD' ? t.coefficientHint : resultType === 'ANNUAL' ? t.annualHint : t.calculateDescription}</p>
    <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onCancel}>{t.cancel}</Button><Button type="button" disabled={mutation.isPending} onClick={submit}>{t.calculateResult}</Button></div>
  </div>;
}
