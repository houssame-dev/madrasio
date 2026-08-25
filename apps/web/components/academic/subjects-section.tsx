'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ApiErrorState } from '@/components/ui/states';
import { academicApi } from '@/lib/frontend/academic/api';
import { academicCopy as t } from '@/lib/frontend/academic/copy';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { SubjectDto } from '@/lib/frontend/academic/types';
import { SubjectForm } from './forms';
import { activeTransitions, LifecycleActions } from './lifecycle-actions';
import { EmptyTableRow, InlineFeedback, inputClassName, Modal, Pagination, SectionHeader, StatusBadge, TableShell, selectClassName } from './ui';

export function SubjectsSection({ schoolId, canManage, page, status, search, onPage, onStatus, onSearch }: { schoolId: string; canManage: boolean; page: number; status?: string; search?: string; onPage: (page: number) => void; onStatus: (status?: string) => void; onSearch: (search?: string) => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SubjectDto | null | undefined>();
  const [searchDraft, setSearchDraft] = useState(search ?? '');
  const [notice, setNotice] = useState<string>();
  const params = { page, pageSize: 20, status, search };
  const query = useQuery({ queryKey: academicKeys.list(schoolId, 'subjects', params), queryFn: () => academicApi.subjects(params) });
  const invalidate = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['academic', schoolId, 'subjects'] }), queryClient.invalidateQueries({ queryKey: academicKeys.selectors(schoolId, 'subjects') })]); setNotice(t.mutationSuccess); };
  return <div className="space-y-5"><SectionHeader title={t.sections.subjects} description={t.noCoefficientOnSubject} action={canManage ? <Button type="button" onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createSubject}</Button> : undefined} />{notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}<div className="flex flex-col gap-2 sm:flex-row"><form className="flex flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); onSearch(searchDraft.trim() || undefined); }}><label className="sr-only" htmlFor="subject-search">{t.searchSubjects}</label><input id="subject-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} className={inputClassName} placeholder={t.searchSubjects} /><Button type="submit" variant="outline"><Search className="size-4" aria-hidden="true" />{t.search}</Button>{search ? <Button type="button" variant="ghost" onClick={() => { setSearchDraft(''); onSearch(undefined); }}>{t.clear}</Button> : null}</form><label className="sm:w-52"><span className="sr-only">{t.filterStatus}</span><select aria-label={t.filterStatus} value={status ?? ''} className={selectClassName} onChange={(event) => onStatus(event.target.value || undefined)}><option value="">{t.allStatuses}</option><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label></div>{query.isError ? <ApiErrorState title={t.listError} onRetry={() => void query.refetch()} /> : <><TableShell headers={[t.name, t.code, t.status, t.actions]} loading={query.isPending}>{query.data?.data.length === 0 ? <EmptyTableRow columns={4} /> : query.data?.data.map((subject) => <tr key={subject.id}><td className="px-4 py-3 font-medium">{subject.name}</td><td className="px-4 py-3 text-muted-foreground">{subject.code ?? '—'}</td><td className="px-4 py-3"><StatusBadge status={subject.status} /></td><td className="px-4 py-3"><div className="flex justify-end gap-1">{canManage ? <><Button type="button" variant="ghost" size="sm" aria-label={`${t.edit} ${subject.name}`} onClick={() => setEditing(subject)}><Pencil className="size-4" aria-hidden="true" /></Button><LifecycleActions resourceName={subject.name} path={`/api/v1/subjects/${subject.id}`} transitions={activeTransitions(subject.status)} onSaved={invalidate} /></> : null}</div></td></tr>)}</TableShell>{query.data ? <Pagination {...query.data.meta} onPage={onPage} /> : null}</>}<Modal open={editing !== undefined} title={editing ? t.editSubject : t.createSubject} onClose={() => setEditing(undefined)}>{editing !== undefined ? <SubjectForm initial={editing ?? undefined} onCancel={() => setEditing(undefined)} onSaved={async () => { await invalidate(); setEditing(undefined); }} /> : null}</Modal></div>;
}
