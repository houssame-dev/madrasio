'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@school/ui';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { InlineFeedback, Modal, inputClassName, selectClassName } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { currentUserHomeworkAssignments, homeworkApi } from '@/lib/frontend/homework/api';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';
import { homeworkKeys } from '@/lib/frontend/homework/queries';
import { homeworkStatuses } from '@/lib/frontend/homework/schemas';
import type { HomeworkStatus } from '@/lib/frontend/homework/types';
import { can } from '@/lib/frontend/permissions';
import { HomeworkForm } from './homework-form';
import { HomeworkTable } from './homework-table';

export function HomeworkWorkspace() {
  const app = useAppContext(); const schoolId = app.currentSchool?.id; const role = app.currentSchool?.role;
  const searchParams = useSearchParams(); const pathname = usePathname(); const router = useRouter(); const [creating, setCreating] = useState(false); const [searchDraft, setSearchDraft] = useState(searchParams.get('search') ?? '');
  const pageValue = Number(searchParams.get('page') ?? '1'); const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const statusValue = searchParams.get('status'); const status = homeworkStatuses.includes(statusValue as HomeworkStatus) ? statusValue as HomeworkStatus : undefined;
  const academicYearId = searchParams.get('academicYearId') || undefined; const classId = searchParams.get('classId') || undefined; const dueFrom = searchParams.get('dueFrom') || undefined; const dueTo = searchParams.get('dueTo') || undefined; const search = searchParams.get('search') || undefined;
  const allowed = !!schoolId && !!role && role !== 'PARENT' && can(role, 'homework.read'); const canManage = !!role && can(role, 'homework.manage'); const invalidRange = !!dueFrom && !!dueTo && dueFrom > dueTo;
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => { const next = new URLSearchParams(searchParams.toString()); for (const [key, value] of Object.entries(updates)) { if (value === undefined || value === '') next.delete(key); else next.set(key, String(value)); } const suffix = next.toString(); router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false }); }, [pathname, router, searchParams]);
  const params = { page, pageSize: 20, status, academicYearId, classId, dueFrom, dueTo, search };
  const list = useQuery({ queryKey: homeworkKeys.list(schoolId ?? 'no-school', params), queryFn: () => homeworkApi.list(params), enabled: allowed && !invalidRange });
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'years'), queryFn: academicApi.allYears, enabled: allowed });
  const classes = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes'), enabled: allowed });
  const subjects = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'subjects'), queryFn: () => listAllResource<SubjectDto>('/api/v1/subjects'), enabled: allowed });
  const scope = useQuery({ queryKey: homeworkKeys.authorScope(schoolId ?? 'no-school', app.user.id), queryFn: () => currentUserHomeworkAssignments(app.user.id), enabled: allowed && canManage });
  if (!allowed || !schoolId || !role) return <AccessDeniedWithReturn />;
  if (years.isPending || classes.isPending || subjects.isPending || scope.isPending) return <InlineLoading label={t.loading} />;
  if (years.isError || classes.isError || subjects.isError || scope.isError) return <ApiErrorState title={t.unavailable} onRetry={() => { void years.refetch(); void classes.refetch(); void subjects.refetch(); void scope.refetch(); }} />;
  const availableClasses = academicYearId ? classes.data.filter((item) => item.academicYearId === academicYearId) : classes.data;
  return <div className="mx-auto max-w-[110rem] space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{role === 'TEACHER' ? t.teacherDescription : t.description}</p></div>{canManage && scope.data.length > 0 ? <Button type="button" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden="true" />{t.create}</Button> : null}</header>
    {canManage && scope.data.length === 0 ? <InlineFeedback kind="error">{t.authorScopeMissing}</InlineFeedback> : null}
    <section className="space-y-3" aria-labelledby="homework-filters"><h2 id="homework-filters" className="text-sm font-semibold">{t.filters}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <form className="flex gap-2 sm:col-span-2" onSubmit={(event) => { event.preventDefault(); updateUrl({ search: searchDraft.trim() || undefined, page: 1 }); }}><label className="sr-only" htmlFor="homework-search">{t.search}</label><input id="homework-search" className={inputClassName} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={t.search} /><Button type="submit" variant="outline"><Search className="size-4" aria-hidden="true" />{t.search}</Button></form>
      <select aria-label={t.academicYear} className={selectClassName} value={academicYearId ?? ''} onChange={(event) => updateUrl({ academicYearId: event.target.value || undefined, classId: undefined, page: 1 })}><option value="">{t.allYears}</option>{years.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Class" className={selectClassName} value={classId ?? ''} onChange={(event) => updateUrl({ classId: event.target.value || undefined, page: 1 })}><option value="">{t.allClasses}</option>{availableClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label={t.status} className={selectClassName} value={status ?? ''} onChange={(event) => updateUrl({ status: event.target.value || undefined, page: 1 })}><option value="">{t.allStatuses}</option>{homeworkStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <input aria-label={t.dueFrom} type="date" className={inputClassName} value={dueFrom ?? ''} onChange={(event) => updateUrl({ dueFrom: event.target.value || undefined, page: 1 })} />
      <input aria-label={t.dueTo} type="date" className={inputClassName} value={dueTo ?? ''} onChange={(event) => updateUrl({ dueTo: event.target.value || undefined, page: 1 })} />
    </div></section>
    {invalidRange ? <InlineFeedback kind="error">{t.invalidRange}</InlineFeedback> : list.isError ? <ApiErrorState title={t.unavailable} onRetry={() => void list.refetch()} /> : <HomeworkTable result={list.data} loading={list.isPending} years={years.data} subjects={subjects.data} onPage={(next) => updateUrl({ page: next })} />}
    <Modal open={creating} title={t.create} description={t.authorScopeMissing} onClose={() => setCreating(false)}>{creating ? <HomeworkForm schoolId={schoolId} years={years.data} subjects={subjects.data} assignments={scope.data} onCancel={() => setCreating(false)} /> : null}</Modal>
  </div>;
}
