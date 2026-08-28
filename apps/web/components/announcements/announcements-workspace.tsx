'use client';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@school/ui';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { Modal, inputClassName, selectClassName } from '@/components/academic/ui';
import { ApiErrorState } from '@/components/ui/states';
import { announcementsApi, currentUserAnnouncementAssignments } from '@/lib/frontend/announcements/api';
import { announcementCopy as t } from '@/lib/frontend/announcements/copy';
import { announcementErrorMessage } from '@/lib/frontend/announcements/errors';
import { announcementKeys } from '@/lib/frontend/announcements/queries';
import { announcementAudiences, announcementStatuses, announcementTargetTypes } from '@/lib/frontend/announcements/schemas';
import type { AnnouncementAudience, AnnouncementStatus, AnnouncementTargetType } from '@/lib/frontend/announcements/types';
import { can } from '@/lib/frontend/permissions';
import { AnnouncementForm } from './announcement-form';
import { AnnouncementsTable } from './announcements-table';

export function AnnouncementsWorkspace() {
  const app = useAppContext(); const schoolId = app.currentSchool?.id; const role = app.currentSchool?.role; const searchParams = useSearchParams(); const pathname = usePathname(); const router = useRouter(); const [creating, setCreating] = useState(false); const [searchDraft, setSearchDraft] = useState(searchParams.get('search') ?? '');
  const pageValue = Number(searchParams.get('page') ?? '1'); const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1; const statusValue = searchParams.get('status'); const audienceValue = searchParams.get('audience'); const targetValue = searchParams.get('targetType');
  const status = announcementStatuses.includes(statusValue as AnnouncementStatus) ? statusValue as AnnouncementStatus : undefined; const audience = announcementAudiences.includes(audienceValue as AnnouncementAudience) ? audienceValue as AnnouncementAudience : undefined; const targetType = announcementTargetTypes.includes(targetValue as AnnouncementTargetType) ? targetValue as AnnouncementTargetType : undefined; const search = searchParams.get('search') || undefined;
  const allowed = !!schoolId && !!role && role !== 'PARENT' && can(role, 'announcements.read');
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => { const next = new URLSearchParams(searchParams.toString()); for (const [key, value] of Object.entries(updates)) { if (value === undefined || value === '') next.delete(key); else next.set(key, String(value)); } const suffix = next.toString(); router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false }); }, [pathname, router, searchParams]);
  const params = { page, pageSize: 20, status, audience, targetType, search }; const list = useQuery({ queryKey: announcementKeys.list(schoolId ?? 'no-school', params), queryFn: () => announcementsApi.list(params), enabled: allowed });
  const scope = useQuery({ queryKey: announcementKeys.authorScope(schoolId ?? 'no-school', app.user.id), queryFn: () => currentUserAnnouncementAssignments(app.user.id), enabled: allowed && role === 'TEACHER' });
  const canCreate = can(role, 'announcements.create') && (role !== 'TEACHER' || (scope.data ?? []).some((item) => item.status === 'ACTIVE'));
  if (!allowed || !schoolId || !role) return <AccessDeniedWithReturn />;
  return <div className="mx-auto max-w-7xl space-y-6"><header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{role === 'TEACHER' ? t.teacherDescription : t.description}</p></div>{canCreate ? <Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden="true" />{t.create}</Button> : null}</header>
    <section aria-label={t.filters} className="rounded-lg border bg-card p-4"><form className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto]" onSubmit={(event) => { event.preventDefault(); updateUrl({ search: searchDraft.trim() || undefined, page: 1 }); }}><div className="relative"><Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><input aria-label={t.search} className={`${inputClassName} ps-9`} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} /></div><select aria-label={t.status} className={selectClassName} value={status ?? ''} onChange={(event) => updateUrl({ status: event.target.value || undefined, page: 1 })}><option value="">{t.allStatuses}</option>{announcementStatuses.map((item) => <option key={item}>{item}</option>)}</select><select aria-label={t.audience} className={selectClassName} value={audience ?? ''} onChange={(event) => updateUrl({ audience: event.target.value || undefined, page: 1 })}><option value="">{t.allAudiences}</option>{announcementAudiences.map((item) => <option key={item}>{item}</option>)}</select><select aria-label={t.targetType} className={selectClassName} value={targetType ?? ''} onChange={(event) => updateUrl({ targetType: event.target.value || undefined, page: 1 })}><option value="">{t.allTargets}</option>{announcementTargetTypes.map((item) => <option key={item}>{item}</option>)}</select><Button type="submit" variant="outline">{t.search}</Button></form></section>
    {list.isError ? <ApiErrorState title={t.unavailable} description={announcementErrorMessage(list.error)} onRetry={() => void list.refetch()} /> : <AnnouncementsTable result={list.data} loading={list.isPending} onPage={(next) => updateUrl({ page: next })} />}
    <Modal open={creating} title={t.create} description={t.plainText} onClose={() => setCreating(false)}>{creating ? <AnnouncementForm schoolId={schoolId} onCancel={() => setCreating(false)} /> : null}</Modal>
  </div>;
}
