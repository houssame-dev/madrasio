'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@school/ui';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { Modal, selectClassName } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicPeriodDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { can } from '@/lib/frontend/permissions';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeKeys } from '@/lib/frontend/grades/queries';
import type { GradebookStatus } from '@/lib/frontend/grades/types';
import { GradebookForm } from './gradebook-form';
import { GradebooksTable } from './gradebooks-table';

const statuses: readonly GradebookStatus[] = ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'];

export function GradebooksWorkspace() {
  const app = useAppContext(); const role = app.currentSchool?.role; const schoolId = app.currentSchool?.id;
  const [creating, setCreating] = useState(false);
  const searchParams = useSearchParams(); const pathname = usePathname(); const router = useRouter();
  const pageValue = Number(searchParams.get('page') ?? '1'); const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const statusValue = searchParams.get('status'); const status = statuses.includes(statusValue as GradebookStatus) ? statusValue as GradebookStatus : undefined;
  const academicYearId = searchParams.get('academicYearId') || undefined;
  const academicPeriodId = searchParams.get('academicPeriodId') || undefined;
  const classId = searchParams.get('classId') || undefined;
  const subjectId = searchParams.get('subjectId') || undefined;
  const allowed = !!role && !!schoolId && role !== 'PARENT' && can(role, 'grades.read');
  const canCreate = !!role && (role === 'TEACHER' ? can(role, 'grades.enter') : can(role, 'grades.manage'));
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) { if (value === undefined || value === '') next.delete(key); else next.set(key, String(value)); }
    const suffix = next.toString(); router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);
  const params = { page, pageSize: 20, status, academicYearId, academicPeriodId, classId, subjectId };
  const gradebooks = useQuery({ queryKey: gradeKeys.gradebookList(schoolId ?? 'no-school', params), queryFn: () => gradesApi.gradebooks(params), enabled: allowed });
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'years'), queryFn: academicApi.allYears, enabled: allowed });
  const classes = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes'), enabled: allowed });
  const subjects = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'subjects'), queryFn: () => listAllResource<SubjectDto>('/api/v1/subjects'), enabled: allowed });
  const periods = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', `periods:${academicYearId ?? 'none'}`), queryFn: () => listAllResource<AcademicPeriodDto>(`/api/v1/academic-years/${academicYearId}/periods`), enabled: allowed && !!academicYearId });
  const versions = useQuery({ queryKey: gradeKeys.configurationVersions(schoolId ?? 'no-school'), queryFn: gradesApi.allConfigurationVersions, enabled: allowed && canCreate });
  if (!allowed || !role || !schoolId) return <AccessDeniedWithReturn />;
  if (years.isPending || classes.isPending || subjects.isPending) return <InlineLoading label={t.loading} />;
  if (years.isError || classes.isError || subjects.isError) return <ApiErrorState title={t.unavailable} onRetry={() => { void years.refetch(); void classes.refetch(); void subjects.refetch(); }} />;
  const availableClasses = academicYearId ? classes.data.filter((row) => row.academicYearId === academicYearId) : classes.data;
  return <div className="mx-auto max-w-[110rem] space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{role === 'TEACHER' ? t.teacherDescription : t.description}</p></div><div className="flex flex-wrap gap-2"><Link href="/grades/results" className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">{t.resultsWorkspace}</Link>{canCreate ? <Button type="button" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden="true" />{t.createGradebook}</Button> : null}</div></header>
    <section className="space-y-3" aria-labelledby="gradebook-filters"><h2 id="gradebook-filters" className="text-sm font-semibold">{t.filters}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label><span className="sr-only">{t.academicYear}</span><select aria-label={t.academicYear} className={selectClassName} value={academicYearId ?? ''} onChange={(event) => updateUrl({ academicYearId: event.target.value || undefined, academicPeriodId: undefined, classId: undefined, page: 1 })}><option value="">{t.allYears}</option>{years.data.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label><span className="sr-only">{t.period}</span><select aria-label={t.period} className={selectClassName} value={academicPeriodId ?? ''} disabled={!academicYearId || periods.isPending} onChange={(event) => updateUrl({ academicPeriodId: event.target.value || undefined, page: 1 })}><option value="">{t.allPeriods}</option>{periods.data?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label><span className="sr-only">{t.class}</span><select aria-label={t.class} className={selectClassName} value={classId ?? ''} onChange={(event) => updateUrl({ classId: event.target.value || undefined, page: 1 })}><option value="">{t.allClasses}</option>{availableClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label><span className="sr-only">{t.subject}</span><select aria-label={t.subject} className={selectClassName} value={subjectId ?? ''} onChange={(event) => updateUrl({ subjectId: event.target.value || undefined, page: 1 })}><option value="">{t.allSubjects}</option>{subjects.data.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label><span className="sr-only">{t.status}</span><select aria-label={t.status} className={selectClassName} value={status ?? ''} onChange={(event) => updateUrl({ status: event.target.value || undefined, page: 1 })}><option value="">{t.allStatuses}</option>{statuses.map((row) => <option key={row} value={row}>{row}</option>)}</select></label>
    </div></section>
    {gradebooks.isError ? <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void gradebooks.refetch()} /> : <GradebooksTable schoolId={schoolId} result={gradebooks.data} loading={gradebooks.isPending} years={years.data} classes={classes.data} subjects={subjects.data} onPage={(next) => updateUrl({ page: next })} />}
    <Modal open={creating} title={t.createGradebook} description={t.createDescription} onClose={() => setCreating(false)}>{creating ? <GradebookForm schoolId={schoolId} years={years.data} classes={classes.data} subjects={subjects.data} versions={versions.data ?? []} versionsPending={versions.isPending} versionsError={versions.isError} refetchVersions={() => versions.refetch()} onCancel={() => setCreating(false)} /> : null}</Modal>
  </div>;
}
