'use client';
import { SearchInput } from '@/components/ui/search-input';
import { useDomainText } from '@/i18n/use-domain-text';
import { managementCopy } from '@/lib/frontend/management-copy';

import { useSuccessFeedback } from '@/lib/frontend/use-success-feedback';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ApiErrorState } from '@/components/ui/states';
import { academicApi, listAllVersions } from '@/lib/frontend/academic/api';
import { useAcademicCopy } from '@/i18n/use-domain-copy';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { ClassDto } from '@/lib/frontend/academic/types';
import { ClassForm } from './forms';
import { classTransitions, LifecycleActions } from './lifecycle-actions';
import { EmptyTableRow, InlineFeedback, Modal, Pagination, SectionHeader, StatusBadge, TableShell, selectClassName } from './ui';

export function ClassesSection({ schoolId, canManage, page, status, search, onSearch = () => {}, onPage, onStatus }: { schoolId: string; canManage: boolean; page: number; status?: string; search?: string; onSearch?: (search?: string) => void; onPage: (page: number) => void; onStatus: (status?: string) => void }) {
  const text = useDomainText();
  const t = useAcademicCopy();
  const queryClient = useQueryClient();
  const [yearFilter, setYearFilter] = useState<string>();
  const [editing, setEditing] = useState<ClassDto | null | undefined>();
  const [notice, setNotice] = useSuccessFeedback();
  const params = { page, pageSize: 20, search, status, academicYearId: yearFilter };
  const classes = useQuery({ queryKey: academicKeys.list(schoolId, 'classes', params), queryFn: () => academicApi.classes(params) });
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId, 'years'), queryFn: academicApi.allYears });
  const stages = useQuery({ queryKey: academicKeys.selectors(schoolId, 'stages'), queryFn: academicApi.allStages });
  const levels = useQuery({ queryKey: academicKeys.selectors(schoolId, 'levels'), queryFn: academicApi.allLevels });
  const tracks = useQuery({ queryKey: academicKeys.selectors(schoolId, 'tracks'), queryFn: academicApi.allTracks });
  const versions = useQuery({ queryKey: academicKeys.selectors(schoolId, 'versions'), queryFn: listAllVersions });
  const selectorPending = years.isPending || stages.isPending || levels.isPending || tracks.isPending || versions.isPending;
  const selectorError = years.isError || stages.isError || levels.isError || tracks.isError || versions.isError;
  const name = <T extends { id: string; name: string }>(rows: T[] | undefined, id: string | null) => id ? rows?.find((row) => row.id === id)?.name ?? id : '—';
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ['academic', schoolId, 'classes'] }); setNotice(t.mutationSuccess); };
  const canCreate = canManage && !selectorPending && !selectorError && !!years.data?.length && !!levels.data?.length && !!versions.data?.length;
  return <div className="space-y-5"><SectionHeader title={t.sections.classes} description={t.yearImmutable} action={canManage ? <Button type="button" disabled={!canCreate} onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createClass}</Button> : undefined} />{notice ? <InlineFeedback brand kind="success">{notice}</InlineFeedback> : null}{selectorError ? <InlineFeedback brand kind="error">{t.selectorUnavailable}</InlineFeedback> : null}<SearchInput id="classes-search" label={text(managementCopy.searchClasses)} copy={{ search: t.search, clear: text("Clear search"), searching: text("Searching…") }} value={search} onSearch={onSearch} busy={classes.isFetching} /><div className="grid gap-2 sm:grid-cols-2"><label><span className="mb-1.5 block text-sm font-medium">{t.academicYear}</span><select aria-label={t.academicYear} value={yearFilter ?? ''} className={selectClassName} onChange={(event) => { setYearFilter(event.target.value || undefined); onPage(1); }}><option value="">{text("All academic years")}</option>{years.data?.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label><label><span className="mb-1.5 block text-sm font-medium">{t.filterStatus}</span><select aria-label={t.filterStatus} value={status ?? ''} className={selectClassName} onChange={(event) => onStatus(event.target.value || undefined)}><option value="">{t.allStatuses}</option>{['ACTIVE', 'CLOSED', 'ARCHIVED'].map((value) => <option key={value} value={value}>{text(value)}</option>)}</select></label></div>{classes.isError ? <ApiErrorState title={t.listError} onRetry={() => void classes.refetch()} /> : <><TableShell responsive headers={[t.name, t.academicYear, `${t.stage} / ${t.level}`, t.track, t.curriculumVersion, t.status, t.actions]} loading={classes.isPending || selectorPending}>{classes.data?.data.length === 0 ? <EmptyTableRow columns={7} /> : classes.data?.data.map((item) => { const level = levels.data?.find((value) => value.id === item.levelId); const version = versions.data?.find((value) => value.id === item.curriculumVersionId); return <tr key={item.id}><td dir="auto" className="px-4 py-3 font-medium">{item.name}</td><td dir="auto" className="px-4 py-3">{name(years.data, item.academicYearId)}</td><td dir="auto" className="px-4 py-3">{name(stages.data, item.stageId)}<br /><span className="text-muted-foreground">{level?.name ?? item.levelId}</span></td><td dir="auto" className="px-4 py-3">{name(tracks.data, item.trackId)}</td><td dir="auto" className="px-4 py-3">{version ? `${version.curriculumName} — ${version.name}` : item.curriculumVersionId}</td><td dir="auto" className="px-4 py-3"><StatusBadge brand status={item.status} label={text(item.status)} /></td><td dir="auto" className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1">{canManage && item.status !== 'ARCHIVED' ? <Button type="button" variant="ghost" size="sm" aria-label={`${t.edit} ${item.name}`} onClick={() => setEditing(item)}><Pencil className="size-4" aria-hidden="true" /></Button> : null}{canManage ? <LifecycleActions resourceName={item.name} path={`/api/v1/classes/${item.id}`} transitions={classTransitions(item.status)} onSaved={invalidate} /> : null}</div></td></tr>; })}</TableShell>{classes.data ? <Pagination {...classes.data.meta} onPage={onPage} /> : null}</>}<Modal open={editing !== undefined} title={editing ? t.editClass : t.createClass} description={editing ? t.yearImmutable : undefined} onClose={() => setEditing(undefined)}>{editing !== undefined && years.data && levels.data && tracks.data && versions.data ? <ClassForm years={years.data} levels={levels.data} tracks={tracks.data} versions={versions.data} initial={editing ?? undefined} onCancel={() => setEditing(undefined)} onSaved={async () => { await invalidate(); setEditing(undefined); }} /> : null}</Modal></div>;
}
