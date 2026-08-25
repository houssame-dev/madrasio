'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ApiErrorState } from '@/components/ui/states';
import { academicApi } from '@/lib/frontend/academic/api';
import { academicCopy as t } from '@/lib/frontend/academic/copy';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { OrderedStructureDto } from '@/lib/frontend/academic/types';
import { OrderedStructureForm } from './forms';
import { activeTransitions, LifecycleActions } from './lifecycle-actions';
import { EmptyTableRow, InlineFeedback, Modal, Pagination, SectionHeader, StatusBadge, TableShell, selectClassName } from './ui';

export function TracksSection({ schoolId, canManage, page, status, onPage, onStatus }: { schoolId: string; canManage: boolean; page: number; status?: string; onPage: (page: number) => void; onStatus: (status?: string) => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<OrderedStructureDto | null | undefined>();
  const [notice, setNotice] = useState<string>();
  const params = { page, pageSize: 20, status };
  const query = useQuery({ queryKey: academicKeys.list(schoolId, 'tracks', params), queryFn: () => academicApi.tracks(params) });
  const invalidate = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['academic', schoolId, 'tracks'] }), queryClient.invalidateQueries({ queryKey: academicKeys.selectors(schoolId, 'tracks') })]); setNotice(t.mutationSuccess); };
  return <div className="space-y-5"><SectionHeader title={t.sections.tracks} description="Tracks are optional School-level pathways and do not belong to a Stage or Level." action={canManage ? <Button type="button" onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createTrack}</Button> : undefined} />{notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}<label className="block max-w-xs"><span className="sr-only">{t.filterStatus}</span><select aria-label={t.filterStatus} value={status ?? ''} className={selectClassName} onChange={(event) => onStatus(event.target.value || undefined)}><option value="">{t.allStatuses}</option><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>{query.isError ? <ApiErrorState title={t.listError} onRetry={() => void query.refetch()} /> : <><TableShell headers={[t.sequence, t.name, t.status, t.actions]} loading={query.isPending}>{query.data?.data.length === 0 ? <EmptyTableRow columns={4} /> : query.data?.data.map((track) => <tr key={track.id}><td className="px-4 py-3">{track.sequence}</td><td className="px-4 py-3 font-medium">{track.name}</td><td className="px-4 py-3"><StatusBadge status={track.status} /></td><td className="px-4 py-3"><div className="flex justify-end gap-1">{canManage ? <><Button type="button" variant="ghost" size="sm" aria-label={`${t.edit} ${track.name}`} onClick={() => setEditing(track)}><Pencil className="size-4" aria-hidden="true" /></Button><LifecycleActions resourceName={track.name} path={`/api/v1/tracks/${track.id}`} transitions={activeTransitions(track.status)} onSaved={invalidate} /></> : null}</div></td></tr>)}</TableShell>{query.data ? <Pagination {...query.data.meta} onPage={onPage} /> : null}</>}<Modal open={editing !== undefined} title={editing ? t.editTrack : t.createTrack} onClose={() => setEditing(undefined)}>{editing !== undefined ? <OrderedStructureForm resource="tracks" initial={editing ?? undefined} onCancel={() => setEditing(undefined)} onSaved={async () => { await invalidate(); setEditing(undefined); }} /> : null}</Modal></div>;
}
