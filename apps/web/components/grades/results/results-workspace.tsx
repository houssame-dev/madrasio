'use client';

import { useQuery } from '@tanstack/react-query';
import { Calculator, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@school/ui';
import { EmptyTableRow, InlineFeedback, Modal, Pagination, StatusBadge, TableShell, selectClassName } from '@/components/academic/ui';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicPeriodDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { can } from '@/lib/frontend/permissions';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeKeys } from '@/lib/frontend/grades/queries';
import type { GradebookDto, ResultDto, ResultStatus, ResultType } from '@/lib/frontend/grades/types';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentKeys } from '@/lib/frontend/students/queries';
import { ResultCalculationForm } from './result-calculation-form';
import { ResultDetail, type ResultLabels } from './result-detail';

const types: readonly ResultType[] = ['SUBJECT', 'PERIOD', 'ANNUAL'];
const statuses: readonly ResultStatus[] = ['CALCULATED', 'FINALIZED'];

export function ResultsWorkspace() {
  const app = useAppContext(); const role = app.currentSchool?.role; const schoolId = app.currentSchool?.id;
  const searchParams = useSearchParams(); const pathname = usePathname(); const router = useRouter();
  const rawType = searchParams.get('resultType'); const resultType: ResultType = role === 'TEACHER' ? 'SUBJECT' : types.includes(rawType as ResultType) ? rawType as ResultType : 'SUBJECT';
  const pageValue = Number(searchParams.get('page') ?? '1'); const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const rawStatus = searchParams.get('status'); const status = statuses.includes(rawStatus as ResultStatus) ? rawStatus as ResultStatus : undefined;
  const academicYearId = searchParams.get('academicYearId') || undefined; const academicPeriodId = searchParams.get('academicPeriodId') || undefined; const classId = searchParams.get('classId') || undefined; const subjectId = searchParams.get('subjectId') || undefined; const studentId = searchParams.get('studentId') || undefined;
  const allowed = !!role && !!schoolId && role !== 'PARENT' && can(role, 'grades.read');
  const canCalculate = !!role && (resultType === 'SUBJECT' ? (role === 'TEACHER' ? can(role, 'grades.enter') : can(role, 'grades.manage')) : role !== 'TEACHER' && can(role, 'grades.manage'));
  const canAdminister = !!role && role !== 'TEACHER' && can(role, 'grades.manage') && can(role, 'grades.publish');
  const [calculating, setCalculating] = useState(false); const [selected, setSelected] = useState<{ id: string; type: ResultType } | null>(null); const [notice, setNotice] = useState<string>();
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => { const next = new URLSearchParams(searchParams.toString()); for (const [key, value] of Object.entries(updates)) { if (value === undefined || value === '') next.delete(key); else next.set(key, String(value)); } const suffix = next.toString(); router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false }); }, [pathname, router, searchParams]);
  const params = { page, pageSize: 20, status, academicYearId, academicPeriodId: resultType === 'ANNUAL' ? undefined : academicPeriodId, classId, subjectId: resultType === 'SUBJECT' ? subjectId : undefined, studentId };
  const results = useQuery({ queryKey: gradeKeys.resultList(schoolId ?? 'no-school', resultType, params), queryFn: () => gradesApi.results(resultType, params), enabled: allowed });
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'years'), queryFn: academicApi.allYears, enabled: allowed });
  const classes = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes'), enabled: allowed });
  const subjects = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'subjects'), queryFn: () => listAllResource<SubjectDto>('/api/v1/subjects'), enabled: allowed });
  const students = useQuery({ queryKey: studentKeys.list(schoolId ?? 'no-school', { pageSize: 100 }), queryFn: () => studentsApi.all(), enabled: allowed });
  const gradebooks = useQuery({ queryKey: [...gradeKeys.gradebooks(schoolId ?? 'no-school'), 'selector'], queryFn: gradesApi.allGradebooks, enabled: allowed });
  const periods = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', `periods:${academicYearId ?? 'none'}`), queryFn: () => listAllResource<AcademicPeriodDto>(`/api/v1/academic-years/${academicYearId}/periods`), enabled: allowed && !!academicYearId });
  if (!allowed || !role || !schoolId) return <AccessDeniedWithReturn />;
  if (years.isPending || classes.isPending || subjects.isPending || students.isPending || gradebooks.isPending) return <InlineLoading label={t.loading} />;
  if (years.isError || classes.isError || subjects.isError || students.isError || gradebooks.isError) return <ApiErrorState title={t.resultsUnavailable} onRetry={() => { void years.refetch(); void classes.refetch(); void subjects.refetch(); void students.refetch(); void gradebooks.refetch(); }} />;
  const studentLabel = (id: string) => { const value = students.data.find((row) => row.id === id); return value ? `${value.firstName} ${value.lastName}${value.studentCode ? ` (${value.studentCode})` : ''}` : id; };
  const yearLabel = (id: string) => years.data.find((row) => row.id === id)?.name ?? id;
  const classLabel = (id: string) => classes.data.find((row) => row.id === id)?.name ?? id;
  const subjectLabel = (id: string | null) => subjects.data.find((row) => row.id === id)?.name ?? id ?? t.none;
  const periodLabel = (id: string | null) => periods.data?.find((row) => row.id === id)?.name ?? id ?? t.none;
  const labels: ResultLabels = { student: studentLabel, year: yearLabel, period: periodLabel, klass: classLabel, subject: subjectLabel };
  const gradebookLabel = (value: GradebookDto) => `${classLabel(value.classId)} · ${subjectLabel(value.subjectId)} · ${yearLabel(value.academicYearId)}`;
  const visibleClasses = academicYearId ? classes.data.filter((row) => row.academicYearId === academicYearId) : classes.data;
  return <div className="mx-auto max-w-[110rem] space-y-6">
    <Link href="/grades" className="text-sm font-medium text-muted-foreground hover:text-foreground">← {t.backToGradebooks}</Link>
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">{t.resultsTitle}</h1><p className="mt-1 text-sm text-muted-foreground">{role === 'TEACHER' ? t.teacherResultsDescription : t.resultsDescription}</p></div>{canCalculate ? <Button type="button" onClick={() => setCalculating(true)}><Calculator className="size-4" aria-hidden="true" />{resultType === 'SUBJECT' ? t.calculateSubject : resultType === 'PERIOD' ? t.calculatePeriod : t.calculateAnnual}</Button> : null}</header>
    {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}
    <nav aria-label={t.resultsTitle} className="flex flex-wrap gap-2">{types.filter((type) => role !== 'TEACHER' || type === 'SUBJECT').map((type) => <Button key={type} type="button" variant={resultType === type ? 'default' : 'outline'} onClick={() => updateUrl({ resultType: type, page: 1, academicPeriodId: undefined, subjectId: undefined })}>{type === 'SUBJECT' ? t.subjectResults : type === 'PERIOD' ? t.periodResults : t.annualResults}</Button>)}</nav>
    {resultType === 'PERIOD' ? <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">{t.coefficientHint}</p> : resultType === 'ANNUAL' ? <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">{t.annualHint}</p> : null}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label={t.filters}><select aria-label={t.academicYear} className={selectClassName} value={academicYearId ?? ''} onChange={(event) => updateUrl({ academicYearId: event.target.value || undefined, academicPeriodId: undefined, classId: undefined, page: 1 })}><option value="">{t.allYears}</option>{years.data.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{resultType !== 'ANNUAL' ? <select aria-label={t.period} className={selectClassName} disabled={!academicYearId || periods.isPending} value={academicPeriodId ?? ''} onChange={(event) => updateUrl({ academicPeriodId: event.target.value || undefined, page: 1 })}><option value="">{t.allPeriods}</option>{periods.data?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select> : null}<select aria-label={t.class} className={selectClassName} value={classId ?? ''} onChange={(event) => updateUrl({ classId: event.target.value || undefined, page: 1 })}><option value="">{t.allClasses}</option>{visibleClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{resultType === 'SUBJECT' ? <select aria-label={t.subject} className={selectClassName} value={subjectId ?? ''} onChange={(event) => updateUrl({ subjectId: event.target.value || undefined, page: 1 })}><option value="">{t.allSubjects}</option>{subjects.data.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select> : null}<select aria-label={t.student} className={selectClassName} value={studentId ?? ''} onChange={(event) => updateUrl({ studentId: event.target.value || undefined, page: 1 })}><option value="">{t.selectStudent}</option>{students.data.map((row) => <option key={row.id} value={row.id}>{row.lastName}, {row.firstName}</option>)}</select><select aria-label={t.status} className={selectClassName} value={status ?? ''} onChange={(event) => updateUrl({ status: event.target.value || undefined, page: 1 })}><option value="">{t.allStatuses}</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></section>
    {results.isError ? <ApiErrorState title={t.resultsUnavailable} description={t.unavailableDescription} onRetry={() => void results.refetch()} /> : <div className="space-y-4"><TableShell headers={[t.student, t.exactResultContext, t.calculatedValue, t.status, t.actions]} loading={results.isPending}>{results.data?.data.length === 0 ? <EmptyTableRow columns={5} /> : results.data?.data.map((result) => <ResultRow key={result.id} result={result} labels={labels} onOpen={() => setSelected({ id: result.id, type: result.resultType })} />)}</TableShell>{results.data ? <Pagination {...results.data.meta} onPage={(next) => updateUrl({ page: next })} /> : null}</div>}
    <Modal open={calculating} title={resultType === 'SUBJECT' ? t.calculateSubject : resultType === 'PERIOD' ? t.calculatePeriod : t.calculateAnnual} description={t.calculateDescription} onClose={() => setCalculating(false)}><ResultCalculationForm schoolId={schoolId} resultType={resultType} gradebooks={gradebooks.data} years={years.data} classes={classes.data} gradebookLabel={gradebookLabel} onCancel={() => setCalculating(false)} onCalculated={(result) => { setCalculating(false); setNotice(t.calculationSucceeded); setSelected({ id: result.id, type: result.resultType }); }} /></Modal>
    <ResultDetail schoolId={schoolId} selected={selected} canAdminister={canAdminister} labels={labels} onClose={() => setSelected(null)} />
  </div>;
}

function ResultRow({ result, labels, onOpen }: { result: ResultDto; labels: ResultLabels; onOpen: () => void }) {
  const context = [labels.year(result.academicYearId), result.academicPeriodId ? labels.period(result.academicPeriodId) : null, labels.klass(result.classId), result.subjectId ? labels.subject(result.subjectId) : null].filter(Boolean).join(' · ');
  return <tr><td className="px-4 py-3 font-medium">{labels.student(result.studentId)}</td><td className="px-4 py-3">{context}</td><td className="px-4 py-3 font-semibold tabular-nums">{result.value}</td><td className="px-4 py-3"><StatusBadge status={result.status} /></td><td className="px-4 py-3 text-end"><Button type="button" variant="ghost" size="sm" onClick={onOpen}>{t.viewResult}<ChevronRight className="size-4" aria-hidden="true" /></Button></td></tr>;
}
