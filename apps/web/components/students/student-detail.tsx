'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@school/ui';
import { InlineFeedback, Modal, StatusBadge, selectClassName } from '@/components/academic/ui';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { ClassDto } from '@/lib/frontend/academic/types';
import { can } from '@/lib/frontend/permissions';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentCopy as t } from '@/lib/frontend/students/copy';
import { invalidateStudent, studentKeys } from '@/lib/frontend/students/queries';
import { EnrollmentForm, TransferForm } from './enrollment-forms';
import { EnrollmentHistory } from './enrollment-history';
import { StudentLifecycleActions } from './lifecycle-actions';
import { StudentForm } from './student-form';

export function StudentDetailWorkspace({ studentId }: { studentId: string }) {
  const context = useAppContext();
  const role = context.currentSchool?.role;
  if (!role || !context.currentSchool || role === 'PARENT' || !can(role, 'students.read')) return <AccessDeniedWithReturn />;
  return <StudentDetail schoolId={context.currentSchool.id} role={role} studentId={studentId} />;
}

function StudentDetail({ schoolId, role, studentId }: { schoolId: string; role: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'PARENT'; studentId: string }) {
  const canManage = can(role, 'students.manage');
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [notice, setNotice] = useState<string>();
  const yearId = searchParams.get('academicYearId') || '';
  const historyValue = Number(searchParams.get('historyPage') ?? '1');
  const historyPage = Number.isInteger(historyValue) && historyValue > 0 ? historyValue : 1;
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    const suffix = next.toString(); router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);
  const student = useQuery({ queryKey: studentKeys.detail(schoolId, studentId), queryFn: () => studentsApi.detail(studentId) });
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId, 'years'), queryFn: academicApi.allYears });
  const allClasses = useQuery({ queryKey: academicKeys.selectors(schoolId, 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes'), enabled: canManage });
  const yearClasses = useQuery({ queryKey: academicKeys.list(schoolId, 'classes', { academicYearId: yearId, pageSize: 100 }), queryFn: () => listAllResource<ClassDto>('/api/v1/classes', { academicYearId: yearId }), enabled: !!yearId });
  const placement = useQuery({ queryKey: studentKeys.current(schoolId, studentId, yearId), queryFn: () => studentsApi.currentEnrollment(studentId, yearId), enabled: !!yearId && student.isSuccess });
  useEffect(() => {
    if (yearId || !years.data) return;
    const active = years.data.filter((year) => year.status === 'ACTIVE');
    if (active.length === 1) updateUrl({ academicYearId: active[0]!.id });
  }, [updateUrl, yearId, years.data]);
  if (student.isPending || years.isPending) return <InlineLoading label={t.loadingStudent} />;
  if (student.isError || years.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => { void student.refetch(); void years.refetch(); }} />;
  const value = student.data;
  const selectedYear = years.data.find((year) => year.id === yearId);
  const className = placement.data ? yearClasses.data?.find((item) => item.id === placement.data?.classId)?.name ?? t.unknown : t.unknown;
  const name = `${value.firstName} ${value.lastName}`;
  const invalidate = async (message: string = t.changesSaved, includeList = false) => { await invalidateStudent(queryClient, schoolId, studentId, includeList); setNotice(message); };
  const multipleActive = years.data.filter((year) => year.status === 'ACTIVE').length > 1;
  return <div className="mx-auto max-w-[100rem] space-y-6">
    <Link href="/students" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{t.backToStudents}</Link>
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{name}</h1><StatusBadge status={value.status} /></div><p className="mt-1 text-sm text-muted-foreground">{value.studentCode ?? t.studentCode + ': ' + t.unknown}</p></div>{canManage ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden="true" />{t.editStudent}</Button><StudentLifecycleActions student={value} onSaved={async () => invalidate(t.changesSaved, true)} /></div> : <div className="rounded-md border bg-muted px-3 py-2 text-sm">{t.readOnly}</div>}</header>
    {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}
    <section className="space-y-3"><h2 className="text-lg font-semibold">{t.profile}</h2><dl className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3"><div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.firstName}</dt><dd className="mt-1">{value.firstName}</dd></div><div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.lastName}</dt><dd className="mt-1">{value.lastName}</dd></div><div><dt className="text-xs font-medium uppercase text-muted-foreground">{t.studentCode}</dt><dd className="mt-1">{value.studentCode ?? t.unknown}</dd></div></dl><p className="text-sm text-muted-foreground">{t.noLogin}</p></section>
    <section className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">{t.academicPlacement}</h2><p className="mt-1 text-sm text-muted-foreground">{t.explicitYear}</p></div><label className="w-full sm:max-w-sm"><span className="mb-1.5 block text-sm font-medium">{t.academicYear}</span><select className={selectClassName} value={yearId} onChange={(event) => updateUrl({ academicYearId: event.target.value || undefined })}><option value="">{t.selectYear}</option>{years.data.map((year) => <option key={year.id} value={year.id}>{year.name} — {year.status}</option>)}</select></label></div>
      {multipleActive && !yearId ? <InlineFeedback kind="error">{t.multipleActiveYears}</InlineFeedback> : null}
      {!yearId ? null : placement.isPending || yearClasses.isPending ? <InlineLoading label={t.loadingStudent} /> : placement.isError ? <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void placement.refetch()} /> : placement.data && selectedYear ? <div className="rounded-lg border bg-card p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{t.placementFor(selectedYear.name)}</h3><dl className="mt-3 grid gap-3 sm:grid-cols-4"><div><dt className="text-xs text-muted-foreground">{t.className}</dt><dd className="font-medium">{className}</dd></div><div><dt className="text-xs text-muted-foreground">{t.effectiveFrom}</dt><dd>{placement.data.effectiveFrom}</dd></div><div><dt className="text-xs text-muted-foreground">{t.effectiveUntil}</dt><dd>{placement.data.effectiveUntil ?? t.ongoing}</dd></div><div><dt className="text-xs text-muted-foreground">{t.status}</dt><dd><StatusBadge status={placement.data.status} /></dd></div></dl></div>{canManage && value.status === 'ACTIVE' ? <Button type="button" variant="outline" onClick={() => setTransferring(true)}><RefreshCw className="size-4" aria-hidden="true" />{t.transfer}</Button> : null}</div></div> : <div className="rounded-lg border border-dashed p-6 text-center"><p className="font-medium">{t.noPlacement}</p><p className="mt-1 text-sm text-muted-foreground">{t.noPlacementDescription}</p>{canManage && value.status === 'ACTIVE' && selectedYear && (selectedYear.status === 'PLANNED' || selectedYear.status === 'ACTIVE') ? <Button className="mt-4" type="button" onClick={() => setEnrolling(true)}><Plus className="size-4" aria-hidden="true" />{t.addEnrollment}</Button> : null}</div>}
    </section>
    {canManage ? allClasses.isPending ? <InlineLoading label={t.loadingStudent} /> : allClasses.isError ? <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void allClasses.refetch()} /> : <EnrollmentHistory schoolId={schoolId} studentId={studentId} years={years.data} classes={allClasses.data ?? []} page={historyPage} canManage onPage={(page) => updateUrl({ historyPage: page })} onChanged={() => invalidate(t.placementUpdated)} /> : null}
    <Modal open={editing} title={t.editStudent} onClose={() => setEditing(false)}><StudentForm initial={value} onCancel={() => setEditing(false)} onSaved={async () => { await invalidate(t.changesSaved, true); setEditing(false); }} /></Modal>
    <Modal open={enrolling} title={t.createEnrollment} description={t.enrollmentSeparate} onClose={() => setEnrolling(false)}>{enrolling ? <EnrollmentForm schoolId={schoolId} studentId={studentId} years={years.data} initialYearId={yearId || undefined} onCancel={() => setEnrolling(false)} onSaved={async () => { await invalidate(t.placementUpdated); setEnrolling(false); }} /> : null}</Modal>
    <Modal open={transferring} title={t.transfer} description={t.transferDescription} onClose={() => setTransferring(false)}>{transferring && placement.data && selectedYear && yearClasses.data ? <TransferForm studentId={studentId} year={selectedYear} classes={yearClasses.data} current={placement.data} onCancel={() => setTransferring(false)} onSaved={async () => { await invalidate(t.placementUpdated); setTransferring(false); }} /> : null}</Modal>
  </div>;
}
