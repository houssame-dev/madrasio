'use client';
import { useTranslations } from 'next-intl';
import '@/components/people/people.css';
import { ManagementGuide } from '@/components/academic/ui';
import { usePeopleText } from '@/i18n/use-people-text';

import { SearchInput } from '@/components/ui/search-input';
import { PageContainer } from '@/components/ui/page-container';
import { useSuccessFeedback } from '@/lib/frontend/use-success-feedback';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@school/ui';
import { InlineFeedback, Modal, selectClassName } from '@/components/academic/ui';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState } from '@/components/ui/states';
import { can } from '@/lib/frontend/permissions';
import { teachersApi } from '@/lib/frontend/teachers/api';
import { useTeacherCopy } from '@/i18n/use-people-copy';
import { teacherKeys } from '@/lib/frontend/teachers/queries';
import type { TeacherDto, TeacherStatus } from '@/lib/frontend/teachers/types';
import { TeacherForm } from './teacher-form';
import { TeachersTable } from './teachers-table';

const statuses: readonly TeacherStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];

export function TeachersWorkspace() {
  const ui=useTranslations('peopleExperience');
  const t = useTeacherCopy();
  const text = usePeopleText();

  const context = useAppContext(); const role = context.currentSchool?.role; const schoolId = context.currentSchool?.id;
  const searchParams = useSearchParams(); const pathname = usePathname(); const router = useRouter(); const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TeacherDto | null | undefined>(); const [notice, setNotice] = useSuccessFeedback();
  const pageValue = Number(searchParams.get('page') ?? '1'); const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const rawStatus = searchParams.get('status'); const status = statuses.includes(rawStatus as TeacherStatus) ? rawStatus as TeacherStatus : undefined;
  const search = searchParams.get('search') || undefined;
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => { const next = new URLSearchParams(searchParams.toString()); for (const [key, value] of Object.entries(updates)) { if (value === undefined || value === '') next.delete(key); else next.set(key, String(value)); } const suffix = next.toString(); router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false }); }, [pathname, router, searchParams]);
  const params = { page, pageSize: 20, status, search };
  const allowed = !!role && !!schoolId && role !== 'PARENT' && can(role, 'teachers.read');
  const query = useQuery({ queryKey: teacherKeys.list(schoolId ?? 'no-school', params), queryFn: () => teachersApi.list(params), enabled: allowed });
  if (!allowed || !role || !schoolId) return <AccessDeniedWithReturn />;
  const canManage = can(role, 'teachers.manage');
  const saved = async () => { await queryClient.invalidateQueries({ queryKey: teacherKeys.lists(schoolId) }); setNotice(editing ? t.changesSaved : t.teacherCreated); setEditing(undefined); };
  return <PageContainer variant="MANAGEMENT_WIDE" className="pp-workspace space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">{canManage ? t.title : t.selfTitle}</h1><p className="mt-1 text-sm text-muted-foreground">{canManage ? t.description : t.selfDescription}</p></div>{canManage ? <Button className="pp-primary" type="button" onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createTeacher}</Button> : <div className="rounded-md border bg-muted px-3 py-2 text-sm"><span className="font-medium">{t.readOnly}</span><span className="sr-only">. {t.readOnlyDescription}</span></div>}</header>
    {canManage ? <ManagementGuide area="teachers" /> : null}{notice ? <InlineFeedback brand kind="success">{notice}</InlineFeedback> : null}
    <section className="pp-directory-card"><h2>{ui('directory')}</h2>{canManage ? <div className="pp-filters flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end"><SearchInput id="teacher-search" label={t.searchLabel} value={search} onSearch={(next) => updateUrl({ search: next, page: 1 })} busy={query.isFetching} /><label className="sm:w-56"><span className="mb-1.5 block text-sm font-medium">{t.filterStatus}</span><select aria-label={t.filterStatus} className={selectClassName} value={status ?? ''} onChange={(event) => updateUrl({ status: event.target.value || undefined, page: 1 })}><option value="">{t.allStatuses}</option>{statuses.map((value) => <option key={value} value={value}>{text(value)}</option>)}</select></label></div> : null}
    {query.isError ? <ApiErrorState title={t.listError} onRetry={() => void query.refetch()} /> : <TeachersTable result={query.data} loading={query.isPending} canManage={canManage} onEdit={setEditing} onPage={(next) => updateUrl({ page: next })} />}
    {!canManage && query.data?.data.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t.noLinkedSelfDescription}</p> : null}
    </section><Modal open={editing !== undefined} title={editing ? t.editTeacher : t.createTeacher} description={t.linkedHint} onClose={() => setEditing(undefined)}>{editing !== undefined ? <TeacherForm initial={editing ?? undefined} onCancel={() => setEditing(undefined)} onSaved={saved} /> : null}</Modal>
  </PageContainer>;
}
