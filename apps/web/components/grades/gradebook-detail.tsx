'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { StatusBadge } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicPeriodDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { can } from '@/lib/frontend/permissions';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeKeys, invalidateGradebook } from '@/lib/frontend/grades/queries';
import { AssessmentsPanel } from './assessments-panel';
import { GradebookLifecycleActions } from './gradebook-lifecycle-actions';
import { GradebookGradesPanel } from './grade-entry/gradebook-grades-panel';

export function GradebookDetailWorkspace({ gradebookId }: { gradebookId: string }) {
  const app = useAppContext(); const role = app.currentSchool?.role; const schoolId = app.currentSchool?.id;
  if (!role || !schoolId || role === 'PARENT' || !can(role, 'grades.read')) return <AccessDeniedWithReturn />;
  return <GradebookDetail gradebookId={gradebookId} schoolId={schoolId} role={role} />;
}

function GradebookDetail({ gradebookId, schoolId, role }: { gradebookId: string; schoolId: string; role: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'PARENT' }) {
  const queryClient = useQueryClient();
  const gradebook = useQuery({ queryKey: gradeKeys.gradebookDetail(schoolId, gradebookId), queryFn: () => gradesApi.gradebook(gradebookId) });
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId, 'years'), queryFn: academicApi.allYears });
  const classes = useQuery({ queryKey: academicKeys.selectors(schoolId, 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes') });
  const subjects = useQuery({ queryKey: academicKeys.selectors(schoolId, 'subjects'), queryFn: () => listAllResource<SubjectDto>('/api/v1/subjects') });
  const yearId = gradebook.data?.academicYearId;
  const periods = useQuery({ queryKey: academicKeys.selectors(schoolId, `periods:${yearId ?? 'none'}`), queryFn: () => listAllResource<AcademicPeriodDto>(`/api/v1/academic-years/${yearId}/periods`), enabled: !!yearId });
  if (gradebook.isPending || years.isPending || classes.isPending || subjects.isPending || (!!yearId && periods.isPending)) return <InlineLoading label={t.loading} />;
  if (gradebook.isError || years.isError || classes.isError || subjects.isError || periods.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => { void gradebook.refetch(); void years.refetch(); void classes.refetch(); void subjects.refetch(); void periods.refetch(); }} />;
  const value = gradebook.data;
  const year = years.data.find((row) => row.id === value.academicYearId);
  const period = (periods.data ?? []).find((row) => row.id === value.academicPeriodId);
  const klass = classes.data.find((row) => row.id === value.classId);
  const subject = subjects.data.find((row) => row.id === value.subjectId);
  const canManage = role === 'TEACHER' ? can(role, 'grades.enter') : can(role, 'grades.manage');
  const label = value.name ?? `${klass?.name ?? t.unknown} · ${subject?.name ?? t.unknown}`;
  if (!period) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} />;
  return <div className="mx-auto max-w-[100rem] space-y-6">
    <Link href="/grades" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{t.back}</Link>
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{label}</h1><StatusBadge status={value.status} /></div><p className="mt-1 text-sm text-muted-foreground">{t.exactContextDescription}</p></div>{canManage ? <GradebookLifecycleActions gradebook={value} onSaved={() => invalidateGradebook(queryClient, schoolId, value.id, true)} /> : <div className="rounded-md border bg-muted px-3 py-2 text-sm">{t.readOnly}</div>}</header>
    <section className="space-y-3"><h2 className="text-lg font-semibold">{t.exactContext}</h2><dl className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.academicYear}</dt><dd className="mt-1">{year?.name ?? t.unknown}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.period}</dt><dd className="mt-1">{period.name} <StatusBadge status={period.status} /></dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.class}</dt><dd className="mt-1">{klass?.name ?? t.unknown}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.subject}</dt><dd className="mt-1">{subject?.name ?? t.unknown}</dd></div>
      <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase text-muted-foreground">{t.configurationVersion}</dt><dd className="mt-1 break-all font-mono text-sm">{value.gradingConfigurationVersionId}</dd></div>
    </dl></section>
    <AssessmentsPanel schoolId={schoolId} gradebook={value} period={period} canManage={canManage} />
    <GradebookGradesPanel schoolId={schoolId} gradebookId={value.id} />
  </div>;
}
