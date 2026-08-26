'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@school/ui';
import { Modal, InlineFeedback, inputClassName, selectClassName } from '@/components/academic/ui';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState } from '@/components/ui/states';
import { can } from '@/lib/frontend/permissions';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentCopy as t } from '@/lib/frontend/students/copy';
import { studentKeys } from '@/lib/frontend/students/queries';
import type { StudentDto, StudentStatus } from '@/lib/frontend/students/types';
import { StudentForm } from './student-form';
import { StudentsTable } from './students-table';

const statuses: readonly StudentStatus[] = ['ACTIVE', 'INACTIVE', 'WITHDRAWN', 'ARCHIVED'];

export function StudentsWorkspace() {
  const context = useAppContext();
  const role = context.currentSchool?.role;
  const schoolId = context.currentSchool?.id;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StudentDto | null | undefined>();
  const [notice, setNotice] = useState<string>();
  const pageValue = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const rawStatus = searchParams.get('status');
  const status = statuses.includes(rawStatus as StudentStatus) ? rawStatus as StudentStatus : undefined;
  const search = searchParams.get('search') || undefined;
  const [searchDraft, setSearchDraft] = useState(search ?? '');
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    const suffix = next.toString();
    router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);
  const params = { page, pageSize: 20, status, search };
  const allowed = !!role && !!schoolId && role !== 'PARENT' && can(role, 'students.read');
  const query = useQuery({ queryKey: studentKeys.list(schoolId ?? 'no-school', params), queryFn: () => studentsApi.list(params), enabled: allowed });
  if (!allowed || !role || !schoolId) return <AccessDeniedWithReturn />;
  const canManage = can(role, 'students.manage');
  const saved = async () => { await queryClient.invalidateQueries({ queryKey: studentKeys.lists(schoolId) }); setNotice(editing ? t.changesSaved : t.studentCreated); setEditing(undefined); };
  return <div className="mx-auto max-w-[100rem] space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.description}</p></div>{canManage ? <Button type="button" onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createStudent}</Button> : <div className="rounded-md border bg-muted px-3 py-2 text-sm"><span className="font-medium">{t.readOnly}</span><span className="sr-only">. {t.readOnlyDescription}</span></div>}</header>
    {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}
    <div className="flex flex-col gap-2 sm:flex-row"><form className="flex flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); updateUrl({ search: searchDraft.trim() || undefined, page: 1 }); }}><label className="sr-only" htmlFor="student-search">{t.searchLabel}</label><input id="student-search" className={inputClassName} value={searchDraft} placeholder={t.searchLabel} onChange={(event) => setSearchDraft(event.target.value)} /><Button type="submit" variant="outline"><Search className="size-4" aria-hidden="true" />{t.search}</Button>{search ? <Button type="button" variant="ghost" onClick={() => { setSearchDraft(''); updateUrl({ search: undefined, page: 1 }); }}>{t.clear}</Button> : null}</form><label className="sm:w-56"><span className="sr-only">{t.filterStatus}</span><select aria-label={t.filterStatus} className={selectClassName} value={status ?? ''} onChange={(event) => updateUrl({ status: event.target.value || undefined, page: 1 })}><option value="">{t.allStatuses}</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {query.isError ? <ApiErrorState title={t.listError} onRetry={() => void query.refetch()} /> : <StudentsTable result={query.data} loading={query.isPending} canManage={canManage} onEdit={setEditing} onPage={(next) => updateUrl({ page: next })} />}
    <Modal open={editing !== undefined} title={editing ? t.editStudent : t.createStudent} description={editing ? undefined : t.enrollmentSeparate} onClose={() => setEditing(undefined)}>{editing !== undefined ? <StudentForm initial={editing ?? undefined} onCancel={() => setEditing(undefined)} onSaved={saved} /> : null}</Modal>
  </div>;
}
