'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@school/ui';
import { InlineFeedback, Modal, StatusBadge } from '@/components/academic/ui';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { can } from '@/lib/frontend/permissions';
import { listAllAssignments, teachersApi } from '@/lib/frontend/teachers/api';
import { teacherCopy as t } from '@/lib/frontend/teachers/copy';
import { invalidateTeacher, teacherKeys } from '@/lib/frontend/teachers/queries';
import { AssignmentForm } from './assignment-form';
import { AssignmentsPanel } from './assignments-panel';
import { TeacherLifecycleActions } from './lifecycle-actions';
import { TeacherForm } from './teacher-form';

export function TeacherDetailWorkspace({ teacherId }: { teacherId: string }) {
  const context = useAppContext(); const role = context.currentSchool?.role;
  if (!role || !context.currentSchool || role === 'PARENT' || !can(role, 'teachers.read')) return <AccessDeniedWithReturn />;
  return <TeacherDetail schoolId={context.currentSchool.id} role={role} teacherId={teacherId} />;
}

function TeacherDetail({ schoolId, role, teacherId }: { schoolId: string; role: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'PARENT'; teacherId: string }) {
  const canManage = can(role, 'teachers.manage'); const queryClient = useQueryClient(); const searchParams = useSearchParams(); const pathname = usePathname(); const router = useRouter();
  const [editing, setEditing] = useState(false); const [assigning, setAssigning] = useState(false); const [notice, setNotice] = useState<string>();
  const historyValue = Number(searchParams.get('historyPage') ?? '1'); const historyPage = Number.isInteger(historyValue) && historyValue > 0 ? historyValue : 1;
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => { const next = new URLSearchParams(searchParams.toString()); for (const [key, value] of Object.entries(updates)) { if (value === undefined || value === '') next.delete(key); else next.set(key, String(value)); } const suffix = next.toString(); router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false }); }, [pathname, router, searchParams]);
  const teacher = useQuery({ queryKey: teacherKeys.detail(schoolId, teacherId), queryFn: () => teachersApi.detail(teacherId) });
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId, 'years'), queryFn: academicApi.allYears });
  const classes = useQuery({ queryKey: academicKeys.selectors(schoolId, 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes') });
  const subjects = useQuery({ queryKey: academicKeys.selectors(schoolId, 'subjects'), queryFn: () => listAllResource<SubjectDto>('/api/v1/subjects') });
  const activeAssignments = useQuery({ queryKey: [...teacherKeys.assignmentPrefix(schoolId, teacherId), 'all-active'], queryFn: () => listAllAssignments(teacherId, { status: 'ACTIVE' }), enabled: canManage && teacher.data?.status === 'ACTIVE' });
  if (teacher.isPending || years.isPending || classes.isPending || subjects.isPending) return <InlineLoading label={t.loadingTeacher} />;
  if (teacher.isError || years.isError || classes.isError || subjects.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => { void teacher.refetch(); void years.refetch(); void classes.refetch(); void subjects.refetch(); }} />;
  const value = teacher.data; const name = `${value.firstName} ${value.lastName}`;
  const invalidate = async (message: string = t.changesSaved, includeList = false) => { await invalidateTeacher(queryClient, schoolId, teacherId, includeList); setNotice(message); };
  return <div className="mx-auto max-w-[100rem] space-y-6">
    <Link href="/teachers" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{t.backToTeachers}</Link>
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{name}</h1><StatusBadge status={value.status} /></div><p className="mt-1 text-sm text-muted-foreground">{value.teacherCode ?? `${t.teacherCode}: ${t.unknown}`}</p></div>{canManage ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden="true" />{t.editTeacher}</Button><TeacherLifecycleActions teacher={value} onSaved={async () => invalidate(t.changesSaved, true)} /></div> : <div className="rounded-md border bg-muted px-3 py-2 text-sm">{t.readOnly}</div>}</header>
    {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}
    <div className="grid gap-6 lg:grid-cols-2"><section className="space-y-3"><h2 className="text-lg font-semibold">{t.profile}</h2><dl className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3"><div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.firstName}</dt><dd className="mt-1">{value.firstName}</dd></div><div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.lastName}</dt><dd className="mt-1">{value.lastName}</dd></div><div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.teacherCode}</dt><dd className="mt-1">{value.teacherCode ?? t.unknown}</dd></div></dl>{value.status !== 'ACTIVE' ? <p className="text-sm text-muted-foreground">{t.inactiveScope}</p> : null}</section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">{t.linkedAccount}</h2><div className="rounded-lg border bg-card p-4"><p className="font-medium">{value.userId ? t.linked : t.unlinked}</p><p className="mt-1 text-sm text-muted-foreground">{t.linkedHint}</p></div></section></div>
    {canManage && value.status === 'ACTIVE' ? <div className="flex justify-end"><Button type="button" onClick={() => setAssigning(true)} disabled={activeAssignments.isPending || activeAssignments.isError}><Plus className="size-4" aria-hidden="true" />{t.createAssignment}</Button></div> : null}
    <AssignmentsPanel schoolId={schoolId} teacherId={teacherId} years={years.data} classes={classes.data} subjects={subjects.data} page={historyPage} canManage={canManage} onPage={(page) => updateUrl({ historyPage: page })} onChanged={() => invalidate(t.assignmentsUpdated)} />
    <Modal open={editing} title={t.editTeacher} description={t.linkedHint} onClose={() => setEditing(false)}><TeacherForm initial={value} onCancel={() => setEditing(false)} onSaved={async () => { await invalidate(t.changesSaved, true); setEditing(false); }} /></Modal>
    <Modal open={assigning} title={t.createAssignment} description={t.assignmentSeparate} onClose={() => setAssigning(false)}>{assigning && activeAssignments.data ? <AssignmentForm schoolId={schoolId} teacherId={teacherId} years={years.data} subjects={subjects.data} activeAssignments={activeAssignments.data} onCancel={() => setAssigning(false)} onSaved={async () => { await invalidate(t.assignmentsUpdated); setAssigning(false); }} /> : null}</Modal>
  </div>;
}
